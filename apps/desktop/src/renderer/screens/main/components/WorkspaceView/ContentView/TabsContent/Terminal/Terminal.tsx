import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import debounce from "lodash/debounce";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTerminalCallbacksStore } from "renderer/stores/tabs/terminal-callbacks";
import { useTerminalTheme } from "renderer/stores/theme";
import { HOTKEYS } from "shared/hotkeys";
import {
	CompletionDropdown,
	GhostText,
	HistoryPicker,
	useAutocompleteStore,
	useFileCompletions,
	useGhostSuggestion,
} from "./Autocomplete";
import { sanitizeForTitle } from "./commandBuffer";
import {
	createTerminalInstance,
	getDefaultTerminalBg,
	setupClickToMoveCursor,
	setupFocusListener,
	setupKeyboardHandler,
	setupPasteHandler,
	setupResizeHandlers,
} from "./helpers";
import { parseCwd } from "./parseCwd";
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
	const [terminalCwd, setTerminalCwd] = useState<string | null>(null);
	const [cwdConfirmed, setCwdConfirmed] = useState(false);

	// Autocomplete state
	const setCommandBuffer = useAutocompleteStore((s) => s.setCommandBuffer);
	const clearCommandBuffer = useAutocompleteStore((s) => s.clearCommandBuffer);
	const backspaceCommandBuffer = useAutocompleteStore(
		(s) => s.backspaceCommandBuffer,
	);
	const appendToCommandBuffer = useAutocompleteStore(
		(s) => s.appendToCommandBuffer,
	);
	const closeHistoryPicker = useAutocompleteStore((s) => s.closeHistoryPicker);
	const isHistoryPickerOpen = useAutocompleteStore(
		(s) => s.isHistoryPickerOpen,
	);
	const isCompletionDropdownOpen = useAutocompleteStore(
		(s) => s.isCompletionDropdownOpen,
	);
	const suggestion = useAutocompleteStore((s) => s.suggestion);
	const closeCompletionDropdown = useAutocompleteStore(
		(s) => s.closeCompletionDropdown,
	);

	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const setTabAutoTitle = useTabsStore((s) => s.setTabAutoTitle);
	const updatePaneCwd = useTabsStore((s) => s.updatePaneCwd);
	const focusedPaneIds = useTabsStore((s) => s.focusedPaneIds);
	const terminalTheme = useTerminalTheme();

	// Ref for initial theme to avoid recreating terminal on theme change
	const initialThemeRef = useRef(terminalTheme);

	const isFocused = pane?.tabId ? focusedPaneIds[pane.tabId] === paneId : false;

	// Ghost suggestion hook
	useGhostSuggestion({
		workspaceId,
		enabled: isFocused && !isHistoryPickerOpen && !isCompletionDropdownOpen,
	});

	// File completions hook
	const { triggerCompletion } = useFileCompletions({
		cwd: terminalCwd,
	});

	// Refs avoid effect re-runs when these values change
	const triggerCompletionRef = useRef(triggerCompletion);
	triggerCompletionRef.current = triggerCompletion;

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

	// Seed cwd from initialCwd or workspace path (shell spawns there)
	// OSC-7 will override if/when the shell reports directory changes
	useEffect(() => {
		if (terminalCwd) return; // Already have a cwd, don't override
		const seedCwd = paneInitialCwd || workspaceCwd;
		if (seedCwd) {
			setTerminalCwd(seedCwd);
			setCwdConfirmed(false); // Seeded, not confirmed by OSC-7
		}
	}, [paneInitialCwd, workspaceCwd, terminalCwd]);

	// Sync terminal cwd to store for DirectoryNavigator
	useEffect(() => {
		updatePaneCwd(paneId, terminalCwd, cwdConfirmed);
	}, [terminalCwd, cwdConfirmed, paneId, updatePaneCwd]);

	// Parse terminal data for cwd (OSC 7 sequences)
	const updateCwdFromData = useCallback((data: string) => {
		const cwd = parseCwd(data);
		if (cwd !== null) {
			setTerminalCwd(cwd);
			setCwdConfirmed(true); // Confirmed by OSC-7
		}
	}, []);

	// Ref to use cwd parser inside effect
	const updateCwdRef = useRef(updateCwdFromData);
	updateCwdRef.current = updateCwdFromData;

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
			updateCwdFromData(event.data);
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
					updateCwdRef.current(event.data);
				} else {
					isExitedRef.current = true;
					setSubscriptionEnabled(false);
					xterm.writeln(`\r\n\r\n[Process exited with code ${event.exitCode}]`);
					xterm.writeln("[Press any key to restart]");
				}
			}
		};

		const applyInitialState = (result: {
			wasRecovered: boolean;
			isNew: boolean;
			scrollback: string;
		}) => {
			xterm.write(result.scrollback);
			updateCwdRef.current(result.scrollback);
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
						applyInitialState(result);
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
				clearCommandBuffer();
			} else if (domEvent.key === "Backspace") {
				commandBufferRef.current = commandBufferRef.current.slice(0, -1);
				backspaceCommandBuffer();
			} else if (domEvent.key === "c" && domEvent.ctrlKey) {
				commandBufferRef.current = "";
				clearCommandBuffer();
			} else if (
				domEvent.key.length === 1 &&
				!domEvent.ctrlKey &&
				!domEvent.metaKey
			) {
				commandBufferRef.current += domEvent.key;
				appendToCommandBuffer(domEvent.key);
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
					// Always apply initial state (scrollback) first, then flush pending events
					// This ensures we don't lose terminal history when reattaching
					applyInitialState(result);
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

		const titleDisposable = xterm.onTitleChange((title) => {
			if (title && parentTabIdRef.current) {
				debouncedSetTabAutoTitleRef.current(parentTabIdRef.current, title);
			}
		});

		const handleClear = () => {
			xterm.clear();
			clearScrollbackRef.current({ paneId });
		};

		const handleWrite = (data: string) => {
			if (!isExitedRef.current) {
				writeRef.current({ paneId, data });
			}
		};

		const cleanupKeyboard = setupKeyboardHandler(xterm, {
			onShiftEnter: () => handleWrite("\\\n"),
			onClear: handleClear,
			onHistoryPicker: () => {
				useAutocompleteStore.getState().openHistoryPicker();
			},
			autocomplete: {
				getSuggestion: () => ({
					suggestion: useAutocompleteStore.getState().suggestion,
					buffer: useAutocompleteStore.getState().commandBuffer,
				}),
				onAcceptSuggestion: (suffix) => {
					const fullCommand =
						useAutocompleteStore.getState().commandBuffer + suffix;
					handleWrite(suffix);
					commandBufferRef.current = fullCommand;
					setCommandBuffer(fullCommand);
				},
				onTabCompletion: async () => {
					const triggered = await triggerCompletionRef.current();
					if (!triggered) {
						// No completions, let shell handle Tab
						handleWrite("\t");
					}
					return triggered;
				},
				isDropdownOpen: () =>
					useAutocompleteStore.getState().isCompletionDropdownOpen,
				closeDropdown: () => closeCompletionDropdown(),
			},
		});

		// Setup click-to-move cursor (click on prompt line to move cursor)
		const cleanupClickToMove = setupClickToMoveCursor(xterm, {
			onWrite: handleWrite,
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
				setCommandBuffer(commandBufferRef.current);
			},
		});

		return () => {
			isUnmounted = true;
			inputDisposable.dispose();
			keyDisposable.dispose();
			titleDisposable.dispose();
			cleanupKeyboard();
			cleanupClickToMove();
			cleanupFocus?.();
			cleanupResize();
			cleanupPaste();
			cleanupQuerySuppression();
			unregisterClearCallbackRef.current(paneId);
			debouncedSetTabAutoTitleRef.current?.cancel?.();
			// Detach instead of kill to keep PTY running for reattachment
			detachRef.current({ paneId });
			setSubscriptionEnabled(false);
			// Clear autocomplete state
			clearCommandBuffer();
			closeHistoryPicker();
			closeCompletionDropdown();
			xterm.dispose();
			xtermRef.current = null;
			searchAddonRef.current = null;
		};
	}, [
		paneId,
		workspaceId,
		workspaceCwd,
		appendToCommandBuffer,
		backspaceCommandBuffer,
		clearCommandBuffer,
		closeCompletionDropdown,
		closeHistoryPicker,
		setCommandBuffer,
	]);

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

	// Handler for history picker selection
	const handleHistorySelect = useCallback(
		(command: string) => {
			if (!isExitedRef.current) {
				// Clear current line and write selected command
				writeRef.current({ paneId, data: "\x15" }); // Ctrl+U to clear line
				writeRef.current({ paneId, data: command });
				commandBufferRef.current = command;
				setCommandBuffer(command);
			}
			// Refocus terminal after selection
			xtermRef.current?.focus();
		},
		[paneId, setCommandBuffer],
	);

	// Handler for closing history picker (refocuses terminal)
	const handleHistoryClose = useCallback(() => {
		closeHistoryPicker();
		// Refocus terminal after closing
		xtermRef.current?.focus();
	}, [closeHistoryPicker]);

	// Handler for completion selection
	const handleCompletionSelect = useCallback(
		(insertText: string) => {
			if (!isExitedRef.current) {
				writeRef.current({ paneId, data: insertText });
				commandBufferRef.current += insertText;
				setCommandBuffer(commandBufferRef.current);
			}
			closeCompletionDropdown();
		},
		[paneId, setCommandBuffer, closeCompletionDropdown],
	);

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

			{/* Ghost text suggestion overlay */}
			<GhostText
				xterm={xtermRef.current}
				isVisible={
					isFocused &&
					!isHistoryPickerOpen &&
					!isCompletionDropdownOpen &&
					!!suggestion
				}
			/>

			{/* History picker modal (Ctrl+R) */}
			<HistoryPicker
				workspaceId={workspaceId}
				onSelect={handleHistorySelect}
				onClose={handleHistoryClose}
			/>

			{/* File completion dropdown (Tab) */}
			<CompletionDropdown
				xterm={xtermRef.current}
				onSelect={handleCompletionSelect}
				onClose={closeCompletionDropdown}
			/>

			<div ref={terminalRef} className="h-full w-full" />
		</div>
	);
};
