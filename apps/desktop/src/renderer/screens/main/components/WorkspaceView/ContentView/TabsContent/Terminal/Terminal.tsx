import "@xterm/xterm/css/xterm.css";
import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal as XTerm } from "@xterm/xterm";
import debounce from "lodash/debounce";
import { useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTerminalCallbacksStore } from "renderer/stores/tabs/terminal-callbacks";
import { useTerminalTheme } from "renderer/stores/theme";
import { HOTKEYS } from "shared/hotkeys";
import { sanitizeForTitle } from "./commandBuffer";
import {
	createTerminalInstance,
	getDefaultTerminalBg,
	setupFocusListener,
	setupKeyboardHandler,
	setupPasteHandler,
	setupResizeHandlers,
} from "./helpers";
import { TerminalSearch } from "./TerminalSearch";
import type { TerminalProps, TerminalStreamEvent } from "./types";
import { shellEscapePaths } from "./utils";

export const Terminal = ({ tabId, workspaceId }: TerminalProps) => {
	const paneId = tabId;
	const panes = useTabsStore((s) => s.panes);
	const pane = panes[paneId];
	const paneInitialCommands = pane?.initialCommands;
	const paneInitialCwd = pane?.initialCwd;
	const clearPaneInitialData = useTabsStore((s) => s.clearPaneInitialData);
	const parentTabId = pane?.tabId;
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<XTerm | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const searchAddonRef = useRef<SearchAddon | null>(null);
	const isExitedRef = useRef(false);
	const pendingEventsRef = useRef<TerminalStreamEvent[]>([]);
	const commandBufferRef = useRef("");
	const [subscriptionEnabled, setSubscriptionEnabled] = useState(false);
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const setTabAutoTitle = useTabsStore((s) => s.setTabAutoTitle);
	const focusedPaneIds = useTabsStore((s) => s.focusedPaneIds);
	const terminalTheme = useTerminalTheme();

	// Ref for initial theme to avoid recreating terminal on theme change
	const initialThemeRef = useRef(terminalTheme);

	const isFocused = pane?.tabId ? focusedPaneIds[pane.tabId] === paneId : false;

	// Refs avoid effect re-runs when these values change
	const isFocusedRef = useRef(isFocused);
	isFocusedRef.current = isFocused;

	const paneInitialCommandsRef = useRef(paneInitialCommands);
	const paneInitialCwdRef = useRef(paneInitialCwd);
	const clearPaneInitialDataRef = useRef(clearPaneInitialData);
	paneInitialCommandsRef.current = paneInitialCommands;
	paneInitialCwdRef.current = paneInitialCwd;
	clearPaneInitialDataRef.current = clearPaneInitialData;

	const { data: workspaceCwd } =
		trpc.terminal.getWorkspaceCwd.useQuery(workspaceId);

	const createOrAttachMutation = trpc.terminal.createOrAttach.useMutation();
	const writeMutation = trpc.terminal.write.useMutation();
	const resizeMutation = trpc.terminal.resize.useMutation();
	const detachMutation = trpc.terminal.detach.useMutation();
	const clearScrollbackMutation = trpc.terminal.clearScrollback.useMutation();

	const createOrAttachRef = useRef(createOrAttachMutation.mutate);
	const writeRef = useRef(writeMutation.mutate);
	const resizeRef = useRef(resizeMutation.mutate);
	const detachRef = useRef(detachMutation.mutate);
	const clearScrollbackRef = useRef(clearScrollbackMutation.mutate);
	createOrAttachRef.current = createOrAttachMutation.mutate;
	writeRef.current = writeMutation.mutate;
	resizeRef.current = resizeMutation.mutate;
	detachRef.current = detachMutation.mutate;
	clearScrollbackRef.current = clearScrollbackMutation.mutate;

	const registerClearCallbackRef = useRef(
		useTerminalCallbacksStore.getState().registerClearCallback,
	);
	const unregisterClearCallbackRef = useRef(
		useTerminalCallbacksStore.getState().unregisterClearCallback,
	);

	const parentTabIdRef = useRef(parentTabId);
	parentTabIdRef.current = parentTabId;

	const setTabAutoTitleRef = useRef(setTabAutoTitle);
	setTabAutoTitleRef.current = setTabAutoTitle;

	const debouncedSetTabAutoTitleRef = useRef(
		debounce((tabId: string, title: string) => {
			setTabAutoTitleRef.current(tabId, title);
		}, 100),
	);

	const handleStreamData = (event: TerminalStreamEvent) => {
		// Queue events until terminal is ready to prevent data loss
		if (!xtermRef.current || !subscriptionEnabled) {
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

	trpc.terminal.stream.useSubscription(paneId, {
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
		} = createTerminalInstance(
			container,
			workspaceCwd,
			initialThemeRef.current,
		);
		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;
		isExitedRef.current = false;

		if (isFocusedRef.current) {
			xterm.focus();
		}

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
					paneId,
					tabId: parentTabIdRef.current || paneId,
					workspaceId,
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
				return;
			}
			writeRef.current({ paneId, data });
		};

		const handleKeyPress = (event: {
			key: string;
			domEvent: KeyboardEvent;
		}) => {
			const { domEvent } = event;
			if (domEvent.key === "Enter") {
				const title = sanitizeForTitle(commandBufferRef.current);
				if (title && parentTabIdRef.current) {
					debouncedSetTabAutoTitleRef.current(parentTabIdRef.current, title);
				}
				commandBufferRef.current = "";
			} else if (domEvent.key === "Backspace") {
				commandBufferRef.current = commandBufferRef.current.slice(0, -1);
			} else if (domEvent.key === "c" && domEvent.ctrlKey) {
				commandBufferRef.current = "";
			} else if (
				domEvent.key.length === 1 &&
				!domEvent.ctrlKey &&
				!domEvent.metaKey
			) {
				commandBufferRef.current += domEvent.key;
			}
		};

		const initialCommands = paneInitialCommandsRef.current;
		const initialCwd = paneInitialCwdRef.current;

		createOrAttachRef.current(
			{
				paneId,
				tabId: parentTabIdRef.current || paneId,
				workspaceId,
				cols: xterm.cols,
				rows: xterm.rows,
				initialCommands,
				cwd: initialCwd,
			},
			{
				onSuccess: (result) => {
					// Clear after successful creation to prevent re-running on future reattach
					if (initialCommands || initialCwd) {
						clearPaneInitialDataRef.current(paneId);
					}
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
		const keyDisposable = xterm.onKey(handleKeyPress);

		const handleClear = () => {
			xterm.clear();
			clearScrollbackRef.current({ paneId });
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
		const cleanupPaste = setupPasteHandler(xterm, {
			onPaste: (text) => {
				commandBufferRef.current += text;
			},
		});

		return () => {
			isUnmounted = true;
			inputDisposable.dispose();
			keyDisposable.dispose();
			cleanupKeyboard();
			cleanupFocus?.();
			cleanupResize();
			cleanupPaste();
			cleanupQuerySuppression();
			unregisterClearCallbackRef.current(paneId);
			debouncedSetTabAutoTitleRef.current?.cancel?.();
			// Detach instead of kill to keep PTY running for reattachment
			detachRef.current({ paneId });
			setSubscriptionEnabled(false);
			xterm.dispose();
			xtermRef.current = null;
			searchAddonRef.current = null;
		};
	}, [paneId, workspaceId, workspaceCwd]);

	useEffect(() => {
		const xterm = xtermRef.current;
		if (!xterm || !terminalTheme) return;
		xterm.options.theme = terminalTheme;
	}, [terminalTheme]);

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
			writeRef.current({ paneId, data: text });
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
