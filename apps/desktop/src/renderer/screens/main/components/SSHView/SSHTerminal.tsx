import "@xterm/xterm/css/xterm.css";
import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { trpc } from "renderer/lib/trpc";
import { useTerminalTheme } from "renderer/stores/theme";
import { HOTKEYS } from "shared/hotkeys";
import {
	createTerminalInstance,
	getDefaultTerminalBg,
	setupFocusListener,
	setupKeyboardHandler,
	setupResizeHandlers,
} from "../WorkspaceView/ContentView/TabsContent/Terminal/helpers";
import { TerminalSearch } from "../WorkspaceView/ContentView/TabsContent/Terminal/TerminalSearch";

interface SSHStreamEvent {
	type: "data" | "exit" | "error";
	data?: string;
	exitCode?: number;
	message?: string;
}

interface SSHTerminalProps {
	tabId: string;
	connectionId: string;
	connectionName: string;
	remoteCwd?: string;
	isFocused?: boolean;
	onFocus?: () => void;
}

export function SSHTerminal({
	tabId,
	connectionId,
	connectionName,
	remoteCwd,
	isFocused = true,
	onFocus,
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
	trpc.ssh.stream.useSubscription(tabId, {
		onData: handleStreamData,
		enabled: true,
	});

	const handleTerminalFocus = useCallback(() => {
		onFocus?.();
	}, [onFocus]);

	// Auto-close search when terminal loses focus
	useEffect(() => {
		if (!isFocused) {
			setIsSearchOpen(false);
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
		} = createTerminalInstance(container, remoteCwd, terminalTheme);
		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;
		isExitedRef.current = false;

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
					tabId,
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
							// Keep subscription disabled on failure - no events to process
							// Next startShell() call will clear pending events and try again
						}
					},
					onError: (err) => {
						xterm.writeln(`\r\n\x1b[31mError: ${err.message}\x1b[0m`);
						xterm.writeln("[Press any key to retry]");
						isExitedRef.current = true;
						// Keep subscription disabled on failure - no events to process
						// Next startShell() call will clear pending events and try again
					},
				},
			);
		};

		const handleTerminalInput = (data: string) => {
			if (isExitedRef.current) {
				startShell();
			} else {
				writeRef.current({ tabId, data });
			}
		};

		// Display connection info
		xterm.writeln(`\x1b[36mConnecting to ${connectionName}...\x1b[0m\r\n`);

		// Create SSH shell
		createShellRef.current(
			{
				tabId,
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
						// Keep subscription disabled on failure - no events to process
					}
				},
				onError: (err) => {
					xterm.writeln(`\r\n\x1b[31mError: ${err.message}\x1b[0m`);
					xterm.writeln("[Press any key to retry]");
					isExitedRef.current = true;
					// Keep subscription disabled on failure - no events to process
				},
			},
		);

		const inputDisposable = xterm.onData(handleTerminalInput);

		setupKeyboardHandler(xterm, {
			onShiftEnter: () => {
				if (!isExitedRef.current) {
					writeRef.current({ tabId, data: "\\\n" });
				}
			},
			onClear: () => {
				xterm.clear();
			},
		});

		const cleanupFocus = setupFocusListener(xterm, handleTerminalFocus);
		const cleanupResize = setupResizeHandlers(
			container,
			xterm,
			fitAddon,
			(cols, rows) => {
				resizeRef.current({ tabId, cols, rows });
			},
		);

		return () => {
			isUnmounted = true;
			inputDisposable.dispose();
			cleanupFocus?.();
			cleanupResize();
			cleanupQuerySuppression();
			killRef.current({ tabId });
			setSubscriptionEnabled(false);
			xterm.dispose();
			xtermRef.current = null;
			searchAddonRef.current = null;
		};
	}, [
		tabId,
		connectionId,
		connectionName,
		remoteCwd,
		terminalTheme,
		handleTerminalFocus,
	]);

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
