import "@xterm/xterm/css/xterm.css";
import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTerminalCallbacksStore } from "renderer/stores/tabs/terminal-callbacks";
import { useTerminalTheme } from "renderer/stores/theme";
import { HOTKEYS } from "shared/hotkeys";
import {
	createTerminalInstance,
	getDefaultTerminalBg,
	setupFocusListener,
	setupKeyboardHandler,
	setupResizeHandlers,
} from "./helpers";
import { TerminalSearch } from "./TerminalSearch";

interface SSHStreamEvent {
	type: "data" | "exit" | "error";
	data?: string;
	exitCode?: number;
	message?: string;
}

interface SSHTerminalProps {
	paneId: string;
	connectionId: string;
	connectionName: string;
	remoteCwd?: string;
}

export function SSHTerminal({
	paneId,
	connectionId,
	connectionName,
	remoteCwd,
}: SSHTerminalProps) {
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<XTerm | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const searchAddonRef = useRef<SearchAddon | null>(null);
	const isExitedRef = useRef(false);
	const pendingEventsRef = useRef<SSHStreamEvent[]>([]);
	const [subscriptionEnabled, setSubscriptionEnabled] = useState(false);
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const terminalTheme = useTerminalTheme();
	const initialThemeRef = useRef(terminalTheme);

	const panes = useTabsStore((s) => s.panes);
	const pane = panes[paneId];
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const focusedPaneIds = useTabsStore((s) => s.focusedPaneIds);
	const isFocused = pane?.tabId ? focusedPaneIds[pane.tabId] === paneId : false;
	const isFocusedRef = useRef(isFocused);
	isFocusedRef.current = isFocused;

	const createShellMutation = trpc.ssh.createShell.useMutation();
	const writeMutation = trpc.ssh.write.useMutation();
	const resizeMutation = trpc.ssh.resize.useMutation();
	const killMutation = trpc.ssh.kill.useMutation();

	const createShellRef = useRef(createShellMutation.mutate);
	const writeRef = useRef(writeMutation.mutate);
	const resizeRef = useRef(resizeMutation.mutate);
	const killRef = useRef(killMutation.mutate);

	createShellRef.current = createShellMutation.mutate;
	writeRef.current = writeMutation.mutate;
	resizeRef.current = resizeMutation.mutate;
	killRef.current = killMutation.mutate;

	const registerClearCallbackRef = useRef(
		useTerminalCallbacksStore.getState().registerClearCallback,
	);
	const unregisterClearCallbackRef = useRef(
		useTerminalCallbacksStore.getState().unregisterClearCallback,
	);

	const handleStreamData = (event: SSHStreamEvent) => {
		if (!xtermRef.current) {
			pendingEventsRef.current.push(event);
			return;
		}

		if (!subscriptionEnabled) {
			pendingEventsRef.current.push(event);
			return;
		}

		if (event.type === "data" && event.data) {
			xtermRef.current.write(event.data);
		} else if (event.type === "exit") {
			isExitedRef.current = true;
			setSubscriptionEnabled(false);
			xtermRef.current.writeln(
				`\r\n\r\n[SSH session ended with code ${event.exitCode ?? 0}]`,
			);
			xtermRef.current.writeln("[Press any key to reconnect]");
		} else if (event.type === "error" && event.message) {
			xtermRef.current.writeln(`\r\n\x1b[31mError: ${event.message}\x1b[0m`);
		}
	};

	// Subscribe to SSH stream
	trpc.ssh.stream.useSubscription(paneId, {
		onData: handleStreamData,
		enabled: true,
	});

	// Use ref to avoid triggering full terminal recreation when focus handler changes
	const handleTerminalFocusRef = useRef(() => {});
	handleTerminalFocusRef.current = () => {
		if (pane?.tabId) {
			setFocusedPane(pane.tabId, paneId);
		}
	};

	// Auto-close search when terminal loses focus
	useEffect(() => {
		if (!isFocused) {
			setIsSearchOpen(false);
		}
	}, [isFocused]);

	useEffect(() => {
		if (isFocused && xtermRef.current) {
			xtermRef.current.focus();
		}
	}, [isFocused]);

	// Toggle search with Cmd+F
	useHotkeys(
		HOTKEYS.FIND_IN_TERMINAL.keys,
		() => {
			setIsSearchOpen((prev) => !prev);
		},
		{ enabled: isFocused, preventDefault: true },
		[isFocused],
	);

	useEffect(() => {
		const container = terminalRef.current;
		if (!container) return;

		let isUnmounted = false;

		const {
			xterm,
			fitAddon,
			cleanup: cleanupQuerySuppression,
		} = createTerminalInstance(container, remoteCwd, initialThemeRef.current);
		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;
		isExitedRef.current = false;

		if (isFocusedRef.current) {
			xterm.focus();
		}

		// Load search addon
		import("@xterm/addon-search").then(({ SearchAddon }) => {
			if (isUnmounted) return;
			const searchAddon = new SearchAddon();
			xterm.loadAddon(searchAddon);
			searchAddonRef.current = searchAddon;
		});

		const flushPendingEvents = () => {
			if (pendingEventsRef.current.length === 0) return;
			const events = pendingEventsRef.current.splice(
				0,
				pendingEventsRef.current.length,
			);
			for (const event of events) {
				if (event.type === "data" && event.data) {
					xterm.write(event.data);
				} else if (event.type === "exit") {
					isExitedRef.current = true;
					setSubscriptionEnabled(false);
					xterm.writeln(
						`\r\n\r\n[SSH session ended with code ${event.exitCode ?? 0}]`,
					);
					xterm.writeln("[Press any key to reconnect]");
				} else if (event.type === "error" && event.message) {
					xterm.writeln(`\r\n\x1b[31mError: ${event.message}\x1b[0m`);
				}
			}
		};

		const applyInitialScrollback = (result: { scrollback?: string }) => {
			if (result.scrollback) {
				xterm.write(result.scrollback);
			}
		};

		const startShell = () => {
			isExitedRef.current = false;
			setSubscriptionEnabled(false);
			// Clear any stale pending events from previous sessions
			pendingEventsRef.current = [];
			xterm.clear();
			createShellRef.current(
				{
					paneId,
					connectionId,
					cwd: remoteCwd,
					cols: xterm.cols,
					rows: xterm.rows,
				},
				{
					onSuccess: (result) => {
						if (result.success) {
							applyInitialScrollback(result);
							setSubscriptionEnabled(true);
							flushPendingEvents();
						} else {
							xterm.writeln(
								`\r\n\x1b[31mFailed to create SSH shell: ${result.error}\x1b[0m`,
							);
							xterm.writeln("[Press any key to retry]");
							isExitedRef.current = true;
						}
					},
					onError: (err) => {
						xterm.writeln(`\r\n\x1b[31mError: ${err.message}\x1b[0m`);
						xterm.writeln("[Press any key to retry]");
						isExitedRef.current = true;
					},
				},
			);
		};

		const handleTerminalInput = (data: string) => {
			if (isExitedRef.current) {
				startShell();
			} else {
				writeRef.current({ paneId, data });
			}
		};

		// Display connection info
		xterm.writeln(`\x1b[36mConnecting to ${connectionName}...\x1b[0m\r\n`);

		// Create SSH shell
		createShellRef.current(
			{
				paneId,
				connectionId,
				cwd: remoteCwd,
				cols: xterm.cols,
				rows: xterm.rows,
			},
			{
				onSuccess: (result) => {
					if (result.success) {
						applyInitialScrollback(result);
						setSubscriptionEnabled(true);
						flushPendingEvents();
					} else {
						xterm.writeln(
							`\r\n\x1b[31mFailed to create SSH shell: ${result.error}\x1b[0m`,
						);
						xterm.writeln("[Press any key to retry]");
						isExitedRef.current = true;
					}
				},
				onError: (err) => {
					xterm.writeln(`\r\n\x1b[31mError: ${err.message}\x1b[0m`);
					xterm.writeln("[Press any key to retry]");
					isExitedRef.current = true;
				},
			},
		);

		const inputDisposable = xterm.onData(handleTerminalInput);

		const handleClear = () => {
			xterm.clear();
		};

		const cleanupKeyboard = setupKeyboardHandler(xterm, {
			onShiftEnter: () => {
				if (!isExitedRef.current) {
					writeRef.current({ paneId, data: "\\\n" });
				}
			},
			onClear: handleClear,
		});

		// Register clear callback for context menu access
		registerClearCallbackRef.current(paneId, handleClear);

		const cleanupFocus = setupFocusListener(xterm, () =>
			handleTerminalFocusRef.current(),
		);
		const cleanupResize = setupResizeHandlers(
			container,
			xterm,
			fitAddon,
			(cols, rows) => {
				resizeRef.current({ paneId, cols, rows });
			},
		);

		return () => {
			isUnmounted = true;
			inputDisposable.dispose();
			cleanupKeyboard();
			cleanupFocus?.();
			cleanupResize();
			cleanupQuerySuppression();
			unregisterClearCallbackRef.current(paneId);
			killRef.current({ paneId });
			setSubscriptionEnabled(false);
			xterm.dispose();
			xtermRef.current = null;
			searchAddonRef.current = null;
		};
	}, [paneId, connectionId, connectionName, remoteCwd]);

	// Sync theme changes
	useEffect(() => {
		const xterm = xtermRef.current;
		if (!xterm || !terminalTheme) return;
		xterm.options.theme = terminalTheme;
	}, [terminalTheme]);

	const terminalBg = terminalTheme?.background ?? getDefaultTerminalBg();

	return (
		<div
			role="application"
			className="relative h-full w-full overflow-hidden"
			style={{ backgroundColor: terminalBg }}
		>
			<TerminalSearch
				searchAddon={searchAddonRef.current}
				isOpen={isSearchOpen}
				onClose={() => setIsSearchOpen(false)}
			/>
			<div ref={terminalRef} className="h-full w-full" />
		</div>
	);
}
