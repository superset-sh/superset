import "@xterm/xterm/css/xterm.css";
import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal as XTerm } from "@xterm/xterm";
import debounce from "lodash/debounce";
import { useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
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
	// tabId is actually paneId in the new model
	const paneId = tabId;
	const panes = useTabsStore((s) => s.panes);
	const pane = panes[paneId];
	const paneName = pane?.name || "Terminal";
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

	const parentTabIdRef = useRef(parentTabId);
	parentTabIdRef.current = parentTabId;

	const paneNameRef = useRef(paneName);
	paneNameRef.current = paneName;

	const setTabAutoTitleRef = useRef(setTabAutoTitle);
	setTabAutoTitleRef.current = setTabAutoTitle;

	const debouncedSetTabAutoTitleRef = useRef(
		debounce((tabId: string, title: string) => {
			setTabAutoTitleRef.current(tabId, title);
		}, 100),
	);

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

	trpc.terminal.stream.useSubscription(paneId, {
		onData: handleStreamData,
		// Always listen to prevent missing events during initialization
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
					tabTitle: paneNameRef.current,
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
			writeRef.current({ tabId: paneId, data });
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

		createOrAttachRef.current(
			{
				tabId: paneId,
				workspaceId,
				tabTitle: paneNameRef.current,
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
		const keyDisposable = xterm.onKey(handleKeyPress);

		// Intercept keyboard events to handle app hotkeys and provide iTerm-like line continuation UX
		const cleanupKeyboard = setupKeyboardHandler(xterm, {
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

		const cleanupFocus = setupFocusListener(xterm, () =>
			handleTerminalFocusRef.current(),
		);
		const cleanupResize = setupResizeHandlers(
			container,
			xterm,
			fitAddon,
			(cols, rows) => {
				resizeRef.current({ tabId: paneId, cols, rows });
			},
		);
		// Setup paste handler to ensure bracketed paste mode works for TUI apps like opencode
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
			debouncedSetTabAutoTitleRef.current?.cancel?.();
			// Detach instead of kill to keep PTY running for reattachment
			detachRef.current({ tabId: paneId });
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
