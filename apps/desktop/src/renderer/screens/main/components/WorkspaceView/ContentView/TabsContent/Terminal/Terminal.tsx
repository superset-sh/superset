import "@xterm/xterm/css/xterm.css";
import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { trpc } from "renderer/lib/trpc";
import { useWindowsStore } from "renderer/stores/tabs/store";
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
import type { TerminalProps, TerminalStreamEvent } from "./types";
import { shellEscapePaths } from "./utils";

export const Terminal = ({ tabId, workspaceId }: TerminalProps) => {
	// tabId is actually paneId in the new model
	const paneId = tabId;
	const panes = useWindowsStore((s) => s.panes);
	const pane = panes[paneId];
	const paneName = pane?.name || "Terminal";
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<XTerm | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const searchAddonRef = useRef<SearchAddon | null>(null);
	const isExitedRef = useRef(false);
	const pendingEventsRef = useRef<TerminalStreamEvent[]>([]);
	const [subscriptionEnabled, setSubscriptionEnabled] = useState(false);
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const setFocusedPane = useWindowsStore((s) => s.setFocusedPane);
	const focusedPaneIds = useWindowsStore((s) => s.focusedPaneIds);
	const terminalTheme = useTerminalTheme();

	// Check if this terminal is the focused pane in its window
	const isFocused = pane?.windowId
		? focusedPaneIds[pane.windowId] === paneId
		: false;

	// Ref to track focus state for use in terminal creation effect
	const isFocusedRef = useRef(isFocused);
	isFocusedRef.current = isFocused;

	// Required for resolving relative file paths in terminal commands
	const { data: workspaceCwd } =
		trpc.terminal.getWorkspaceCwd.useQuery(workspaceId);

	const createOrAttachMutation = trpc.terminal.createOrAttach.useMutation();
	const writeMutation = trpc.terminal.write.useMutation();
	const resizeMutation = trpc.terminal.resize.useMutation();
	const detachMutation = trpc.terminal.detach.useMutation();

	// Avoid effect re-runs when mutations change
	const createOrAttachRef = useRef(createOrAttachMutation.mutate);
	const writeRef = useRef(writeMutation.mutate);
	const resizeRef = useRef(resizeMutation.mutate);
	const detachRef = useRef(detachMutation.mutate);

	createOrAttachRef.current = createOrAttachMutation.mutate;
	writeRef.current = writeMutation.mutate;
	resizeRef.current = resizeMutation.mutate;
	detachRef.current = detachMutation.mutate;

	const handleStreamData = (event: TerminalStreamEvent) => {
		if (!xtermRef.current) {
			// Prevent data loss during terminal initialization
			pendingEventsRef.current.push(event);
			return;
		}

		// Prevent race condition where events arrive before scrollback recovery completes
		if (!subscriptionEnabled) {
			pendingEventsRef.current.push(event);
			return;
		}

		if (event.type === "data") {
			xtermRef.current.write(event.data);
		} else if (event.type === "exit") {
			isExitedRef.current = true;
			setSubscriptionEnabled(false);
			xtermRef.current.writeln(
				`\r\n\r\n[Process exited with code ${event.exitCode}]`,
			);
			xtermRef.current.writeln("[Press any key to restart]");
		}
	};

	// Use paneId (tabId) for stream subscription
	trpc.terminal.stream.useSubscription(paneId, {
		onData: handleStreamData,
		// Always listen to prevent missing events during initialization
		enabled: true,
	});

	// Handler to set focused pane when terminal gains focus
	const handleTerminalFocus = useCallback(() => {
		if (pane?.windowId) {
			setFocusedPane(pane.windowId, paneId);
		}
	}, [pane?.windowId, paneId, setFocusedPane]);

	// Auto-close search when terminal loses focus
	useEffect(() => {
		if (!isFocused) {
			setIsSearchOpen(false);
		}
	}, [isFocused]);

	// Autofocus terminal when it becomes the focused pane (e.g., after split)
	useEffect(() => {
		if (isFocused && xtermRef.current) {
			xtermRef.current.focus();
		}
	}, [isFocused]);

	// Toggle search with Cmd+F (only for the focused terminal)
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
		} = createTerminalInstance(container, workspaceCwd, terminalTheme);
		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;
		isExitedRef.current = false;

		// Autofocus on initial render if this terminal is the focused pane
		if (isFocusedRef.current) {
			xterm.focus();
		}

		// Load search addon for Cmd+F functionality
		import("@xterm/addon-search").then(({ SearchAddon }) => {
			if (isUnmounted) return;
			const searchAddon = new SearchAddon();
			xterm.loadAddon(searchAddon);
			searchAddonRef.current = searchAddon;
		});

		// Delay enabling subscription to ensure scrollback is applied first, preventing duplicate output

		const flushPendingEvents = () => {
			if (pendingEventsRef.current.length === 0) return;
			const events = pendingEventsRef.current.splice(
				0,
				pendingEventsRef.current.length,
			);
			for (const event of events) {
				if (event.type === "data") {
					xterm.write(event.data);
				} else {
					isExitedRef.current = true;
					setSubscriptionEnabled(false);
					xterm.writeln(`\r\n\r\n[Process exited with code ${event.exitCode}]`);
					xterm.writeln("[Press any key to restart]");
				}
			}
		};

		const applyInitialScrollback = (result: {
			wasRecovered: boolean;
			isNew: boolean;
			scrollback: string;
		}) => {
			xterm.write(result.scrollback);
		};

		const restartTerminal = () => {
			isExitedRef.current = false;
			setSubscriptionEnabled(false);
			xterm.clear();
			createOrAttachRef.current(
				{
					tabId: paneId,
					workspaceId,
					tabTitle: paneName,
					cols: xterm.cols,
					rows: xterm.rows,
				},
				{
					onSuccess: (result) => {
						applyInitialScrollback(result);
						setSubscriptionEnabled(true);
						flushPendingEvents();
					},
					onError: () => {
						setSubscriptionEnabled(true);
					},
				},
			);
		};

		const handleTerminalInput = (data: string) => {
			if (isExitedRef.current) {
				restartTerminal();
			} else {
				writeRef.current({ tabId: paneId, data });
			}
		};

		createOrAttachRef.current(
			{
				tabId: paneId,
				workspaceId,
				tabTitle: paneName,
				cols: xterm.cols,
				rows: xterm.rows,
			},
			{
				onSuccess: (result) => {
					// Avoid duplication when pending events already contain scrollback data
					const hasPendingEvents = pendingEventsRef.current.length > 0;
					if (result.isNew || !hasPendingEvents) {
						applyInitialScrollback(result);
					}
					setSubscriptionEnabled(true);
					flushPendingEvents();
				},
				onError: () => {
					setSubscriptionEnabled(true);
				},
			},
		);

		const inputDisposable = xterm.onData(handleTerminalInput);

		// Intercept keyboard events to handle app hotkeys and provide iTerm-like line continuation UX
		setupKeyboardHandler(xterm, {
			onShiftEnter: () => {
				if (!isExitedRef.current) {
					// Use shell's native continuation syntax to avoid shell-specific parsing
					writeRef.current({ tabId: paneId, data: "\\\n" });
				}
			},
			onClear: () => {
				xterm.clear();
			},
		});

		// Setup focus listener to track focused pane
		const cleanupFocus = setupFocusListener(xterm, handleTerminalFocus);
		const cleanupResize = setupResizeHandlers(
			container,
			xterm,
			fitAddon,
			(cols, rows) => {
				resizeRef.current({ tabId: paneId, cols, rows });
			},
		);

		return () => {
			isUnmounted = true;
			inputDisposable.dispose();
			cleanupFocus?.();
			cleanupResize();
			cleanupQuerySuppression();
			// Keep PTY running for reattachment
			detachRef.current({ tabId: paneId });
			setSubscriptionEnabled(false);
			xterm.dispose();
			xtermRef.current = null;
			searchAddonRef.current = null;
		};
	}, [
		paneId,
		workspaceId,
		workspaceCwd,
		paneName,
		terminalTheme,
		handleTerminalFocus,
	]);

	// Sync theme changes to xterm instance for live theme switching
	useEffect(() => {
		const xterm = xtermRef.current;
		if (!xterm || !terminalTheme) return;

		xterm.options.theme = terminalTheme;
	}, [terminalTheme]);

	// Match container background to terminal theme for seamless visual integration
	const terminalBg = terminalTheme?.background ?? getDefaultTerminalBg();

	const handleDragOver = (event: React.DragEvent) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
	};

	const handleDrop = (event: React.DragEvent) => {
		event.preventDefault();

		const files = Array.from(event.dataTransfer.files);
		if (files.length === 0) return;

		// Use Electron's webUtils API to access file paths in context-isolated renderer process
		const paths = files.map((file) => window.webUtils.getPathForFile(file));
		const text = shellEscapePaths(paths);

		if (!isExitedRef.current) {
			writeRef.current({ tabId: paneId, data: text });
		}
	};

	return (
		<div
			role="application"
			className="relative h-full w-full overflow-hidden"
			style={{ backgroundColor: terminalBg }}
			onDragOver={handleDragOver}
			onDrop={handleDrop}
		>
			<TerminalSearch
				searchAddon={searchAddonRef.current}
				isOpen={isSearchOpen}
				onClose={() => setIsSearchOpen(false)}
			/>
			<div ref={terminalRef} className="h-full w-full" />
		</div>
	);
};
