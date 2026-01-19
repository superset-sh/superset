import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import debounce from "lodash/debounce";
import { useCallback, useEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { isTerminalKilledByUser } from "renderer/lib/terminal-kill-tracking";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTerminalCallbacksStore } from "renderer/stores/tabs/terminal-callbacks";
import { useTerminalTheme } from "renderer/stores/theme";
import { scheduleTerminalAttach } from "./attach-scheduler";
import {
	createTerminalInstance,
	getDefaultTerminalBg,
	setupClickToMoveCursor,
	setupFocusListener,
	setupKeyboardHandler,
	setupPasteHandler,
	setupResizeHandlers,
	type TerminalRendererRef,
} from "./helpers";
import {
	coldRestoreState,
	pendingDetaches,
	useTerminalConnection,
	useTerminalCwd,
	useTerminalFileLinks,
	useTerminalInput,
	useTerminalSession,
} from "./hooks";
import { ScrollToBottomButton } from "./ScrollToBottomButton";
import {
	ConnectionErrorOverlay,
	KilledOverlay,
	RestoredOverlay,
} from "./TerminalOverlays";
import { TerminalSearch } from "./TerminalSearch";
import type { TerminalProps } from "./types";
import {
	getScrollOffsetFromBottom,
	scrollToBottom,
	shellEscapePaths,
} from "./utils";

// Debug logging for terminal lifecycle (enable via localStorage)
const DEBUG_TERMINAL =
	typeof localStorage !== "undefined" &&
	localStorage.getItem("SUPERSET_TERMINAL_DEBUG") === "1";

export const Terminal = ({ tabId, workspaceId }: TerminalProps) => {
	const paneId = tabId;

	// Store selectors
	const pane = useTabsStore((s) => s.panes[paneId]);
	const paneInitialCommands = pane?.initialCommands;
	const paneInitialCwd = pane?.initialCwd;
	const clearPaneInitialData = useTabsStore((s) => s.clearPaneInitialData);
	const parentTabId = pane?.tabId;
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const setTabAutoTitle = useTabsStore((s) => s.setTabAutoTitle);
	const focusedPaneId = useTabsStore(
		(s) => s.focusedPaneIds[pane?.tabId ?? ""],
	);
	const setPaneStatus = useTabsStore((s) => s.setPaneStatus);
	const terminalTheme = useTerminalTheme();

	// Terminal instance refs
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<XTerm | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const searchAddonRef = useRef<SearchAddon | null>(null);
	const rendererRef = useRef<TerminalRendererRef | null>(null);

	// UI state
	const [exitStatus, setExitStatus] = useState<"killed" | "exited" | null>(
		null,
	);
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [xtermInstance, setXtermInstance] = useState<XTerm | null>(null);

	// Refs for stable values
	const initialThemeRef = useRef(terminalTheme);
	const isFocused = focusedPaneId === paneId;
	const isFocusedRef = useRef(isFocused);
	isFocusedRef.current = isFocused;

	const paneInitialCommandsRef = useRef(paneInitialCommands);
	const paneInitialCwdRef = useRef(paneInitialCwd);
	const clearPaneInitialDataRef = useRef(clearPaneInitialData);
	paneInitialCommandsRef.current = paneInitialCommands;
	paneInitialCwdRef.current = paneInitialCwd;
	clearPaneInitialDataRef.current = clearPaneInitialData;

	const parentTabIdRef = useRef(parentTabId);
	parentTabIdRef.current = parentTabId;

	const setTabAutoTitleRef = useRef(setTabAutoTitle);
	setTabAutoTitleRef.current = setTabAutoTitle;

	const debouncedSetTabAutoTitleRef = useRef(
		debounce((tabIdArg: string, title: string) => {
			setTabAutoTitleRef.current(tabIdArg, title);
		}, 100),
	);

	const restartTerminalRef = useRef<() => void>(() => {});

	// Terminal connection state and mutations
	const {
		connectionError,
		setConnectionError,
		workspaceCwd,
		refs: {
			createOrAttach: createOrAttachRef,
			write: writeRef,
			resize: resizeRef,
			detach: detachRef,
			clearScrollback: clearScrollbackRef,
		},
	} = useTerminalConnection({ workspaceId });

	// Use ref for workspaceCwd to avoid terminal recreation
	const workspaceCwdRef = useRef(workspaceCwd);
	workspaceCwdRef.current = workspaceCwd;

	// Avoid effect re-runs: track overlay states via refs for input gating
	const connectionErrorRef = useRef(connectionError);
	connectionErrorRef.current = connectionError;

	// CWD management (terminalCwd is tracked internally and synced to store)
	const { updateCwdFromData } = useTerminalCwd({
		paneId,
		initialCwd: paneInitialCwd,
		workspaceCwd,
	});

	// File link handling
	const { handleFileLinkClickRef } = useTerminalFileLinks({
		workspaceId,
		workspaceCwdRef,
	});

	// Session management (restoredCwd and updateModesFromData are used internally by the hook)
	const {
		isRestoredMode,
		refs: sessionRefs,
		flushPendingEvents,
		maybeApplyInitialState,
		handleStartShell: sessionHandleStartShell,
		handleRetryConnection: sessionHandleRetryConnection,
		resetForNewSession,
		setupFirstRenderGating,
		handleStreamData,
	} = useTerminalSession(
		{
			paneId,
			onConnectionError: setConnectionError,
			onExitStatusChange: (status) => {
				setExitStatus(status);
				// Clear transient pane status on terminal exit
				if (status !== null) {
					const currentPane = useTabsStore.getState().panes[paneId];
					if (
						currentPane?.status === "working" ||
						currentPane?.status === "permission"
					) {
						setPaneStatus(paneId, "idle");
					}
				}
			},
			onCwdUpdate: updateCwdFromData,
		},
		{ xtermRef, parentTabIdRef, isFocusedRef },
	);

	// Avoid effect re-runs for restored mode
	const isRestoredModeRef = useRef(isRestoredMode);
	isRestoredModeRef.current = isRestoredMode;

	// Input handling (commandBufferRef is managed internally for auto-title)
	const { handleKeyPress, handlePaste } = useTerminalInput({
		paneId,
		isAlternateScreenRef: sessionRefs.isAlternateScreen,
		parentTabIdRef,
		debouncedSetTabAutoTitle: (tabIdArg, title) =>
			debouncedSetTabAutoTitleRef.current(tabIdArg, title),
	});

	// Terminal callback registration refs
	const registerClearCallbackRef = useRef(
		useTerminalCallbacksStore.getState().registerClearCallback,
	);
	const unregisterClearCallbackRef = useRef(
		useTerminalCallbacksStore.getState().unregisterClearCallback,
	);
	const registerScrollToBottomCallbackRef = useRef(
		useTerminalCallbacksStore.getState().registerScrollToBottomCallback,
	);
	const unregisterScrollToBottomCallbackRef = useRef(
		useTerminalCallbacksStore.getState().unregisterScrollToBottomCallback,
	);

	// Handle focus for store update
	const handleTerminalFocusRef = useRef(() => {});
	handleTerminalFocusRef.current = () => {
		if (pane?.tabId) {
			setFocusedPane(pane.tabId, paneId);
		}
	};

	// Stream subscription
	electronTrpc.terminal.stream.useSubscription(paneId, {
		onData: handleStreamData,
		enabled: true,
	});

	// Close search when not focused
	useEffect(() => {
		if (!isFocused) {
			setIsSearchOpen(false);
		}
	}, [isFocused]);

	// Focus terminal when pane is focused
	useEffect(() => {
		const xterm = xtermRef.current;
		if (!xterm) return;
		if (isFocused) {
			xterm.focus();
		}
	}, [isFocused]);

	// Hotkeys
	useAppHotkey(
		"FIND_IN_TERMINAL",
		() => setIsSearchOpen((prev) => !prev),
		{ enabled: isFocused, preventDefault: true },
		[isFocused],
	);

	useAppHotkey(
		"SCROLL_TO_BOTTOM",
		() => {
			if (xtermRef.current) {
				scrollToBottom(xtermRef.current);
			}
		},
		{ enabled: isFocused, preventDefault: true },
		[isFocused],
	);

	// Wrapped action handlers
	const handleRetryConnection = useCallback(() => {
		sessionHandleRetryConnection({
			createOrAttachRef,
			workspaceId,
		});
	}, [sessionHandleRetryConnection, createOrAttachRef, workspaceId]);

	const handleStartShell = useCallback(() => {
		sessionHandleStartShell({
			createOrAttachRef,
			workspaceId,
			fitAddon: fitAddonRef.current,
		});
	}, [sessionHandleStartShell, createOrAttachRef, workspaceId]);

	const handleRestartSession = useCallback(() => {
		restartTerminalRef.current();
	}, []);

	// Main terminal effect
	// biome-ignore lint/correctness/useExhaustiveDependencies: refs used intentionally to read latest values
	useEffect(() => {
		const container = terminalRef.current;
		if (!container) return;

		if (DEBUG_TERMINAL) {
			console.log(`[Terminal] Mount: ${paneId}`);
		}

		// Cancel any pending detach from a previous unmount
		const pendingDetach = pendingDetaches.get(paneId);
		if (pendingDetach) {
			clearTimeout(pendingDetach);
			pendingDetaches.delete(paneId);
		}

		let isUnmounted = false;

		const {
			xterm,
			fitAddon,
			renderer,
			cleanup: cleanupQuerySuppression,
		} = createTerminalInstance(container, {
			cwd: workspaceCwdRef.current ?? undefined,
			initialTheme: initialThemeRef.current,
			onFileLinkClick: (path, line, column) =>
				handleFileLinkClickRef.current(path, line, column),
		});

		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;
		rendererRef.current = renderer;
		sessionRefs.isExited.current = false;
		setXtermInstance(xterm);
		sessionRefs.isStreamReady.current = false;
		sessionRefs.didFirstRender.current = false;
		sessionRefs.pendingInitialState.current = null;
		sessionRefs.firstStreamDataReceived.current = false;

		if (isFocusedRef.current) {
			xterm.focus();
		}

		// Load search addon asynchronously
		import("@xterm/addon-search").then(({ SearchAddon }) => {
			if (isUnmounted) return;
			const searchAddon = new SearchAddon();
			xterm.loadAddon(searchAddon);
			searchAddonRef.current = searchAddon;
		});

		// Setup first render gating
		const { cleanup: cleanupRenderGating, fallbackTimeout } =
			setupFirstRenderGating({
				xterm,
				onFirstRender: maybeApplyInitialState,
			});

		// Restart terminal function
		const restartTerminal = () => {
			resetForNewSession();
			xterm.clear();
			createOrAttachRef.current(
				{
					paneId,
					tabId: parentTabIdRef.current || paneId,
					workspaceId,
					cols: xterm.cols,
					rows: xterm.rows,
					allowKilled: true,
				},
				{
					onSuccess: (result) => {
						sessionRefs.pendingInitialState.current = result;
						maybeApplyInitialState();
					},
					onError: (error) => {
						console.error("[Terminal] Failed to restart:", error);
						setConnectionError(error.message || "Failed to restart terminal");
						sessionRefs.isStreamReady.current = true;
						flushPendingEvents();
					},
				},
			);
		};
		restartTerminalRef.current = restartTerminal;

		// Terminal input handler
		const handleTerminalInput = (data: string) => {
			// When overlays are visible, ignore input
			if (isRestoredModeRef.current || connectionErrorRef.current) {
				return;
			}
			if (sessionRefs.isExited.current) {
				if (!isFocusedRef.current || sessionRefs.wasKilledByUser.current) {
					return;
				}
				restartTerminal();
				return;
			}
			writeRef.current({ paneId, data });
		};

		// Schedule attach
		const initialCommands = paneInitialCommandsRef.current;
		const initialCwd = paneInitialCwdRef.current;

		const cancelInitialAttach = scheduleTerminalAttach({
			paneId,
			priority: isFocusedRef.current ? 0 : 1,
			run: (done) => {
				if (isTerminalKilledByUser(paneId)) {
					sessionRefs.wasKilledByUser.current = true;
					sessionRefs.isExited.current = true;
					sessionRefs.isStreamReady.current = false;
					setExitStatus("killed");
					done();
					return;
				}

				if (DEBUG_TERMINAL) {
					console.log(`[Terminal] createOrAttach start: ${paneId}`);
				}

				const createOrAttachStartTime = Date.now();
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
							setConnectionError(null);

							if (DEBUG_TERMINAL) {
								console.log(
									`[Terminal] createOrAttach success: ${paneId} (${Date.now() - createOrAttachStartTime}ms)`,
									{
										isNew: result.isNew,
										wasRecovered: result.wasRecovered,
										isColdRestore: result.isColdRestore,
										snapshotBytes: result.snapshot?.snapshotAnsi?.length ?? 0,
									},
								);
							}

							if (initialCommands || initialCwd) {
								clearPaneInitialDataRef.current(paneId);
							}

							// Check stored cold restore state from StrictMode remount
							const storedColdRestore = coldRestoreState.get(paneId);
							if (storedColdRestore?.isRestored) {
								// Session hook handles state - just write scrollback
								if (storedColdRestore.scrollback && xterm) {
									xterm.write(storedColdRestore.scrollback);
								}
								sessionRefs.didFirstRender.current = true;
								return;
							}

							// Handle cold restore (first detection)
							if (result.isColdRestore) {
								const scrollback =
									result.snapshot?.snapshotAnsi ?? result.scrollback;
								coldRestoreState.set(paneId, {
									isRestored: true,
									cwd: result.previousCwd || null,
									scrollback,
								});

								if (scrollback && xterm) {
									xterm.write(scrollback);
								}
								sessionRefs.didFirstRender.current = true;
								return;
							}

							sessionRefs.pendingInitialState.current = result;
							maybeApplyInitialState();
						},
						onError: (error) => {
							if (error.message?.includes("TERMINAL_SESSION_KILLED")) {
								sessionRefs.wasKilledByUser.current = true;
								sessionRefs.isExited.current = true;
								sessionRefs.isStreamReady.current = false;
								setExitStatus("killed");
								setConnectionError(null);
								return;
							}

							if (DEBUG_TERMINAL) {
								console.log(
									`[Terminal] createOrAttach error: ${paneId}`,
									error.message,
								);
							}
							console.error("[Terminal] Failed to create/attach:", error);
							setConnectionError(
								error.message || "Failed to connect to terminal",
							);
							sessionRefs.isStreamReady.current = true;
							flushPendingEvents();
						},
						onSettled: () => {
							done();
						},
					},
				);
			},
		});

		// Setup event handlers
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

		const handleScrollToBottom = () => {
			scrollToBottom(xterm);
		};

		const handleWrite = (data: string) => {
			if (sessionRefs.isExited.current) {
				return;
			}
			writeRef.current({ paneId, data });
		};

		const cleanupKeyboard = setupKeyboardHandler(xterm, {
			onShiftEnter: () => handleWrite("\x1b\r"),
			onClear: handleClear,
		});

		const cleanupClickToMove = setupClickToMoveCursor(xterm, {
			onWrite: handleWrite,
		});

		registerClearCallbackRef.current(paneId, handleClear);
		registerScrollToBottomCallbackRef.current(paneId, handleScrollToBottom);

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
			onPaste: handlePaste,
			onWrite: handleWrite,
			isBracketedPasteEnabled: () => sessionRefs.isBracketedPaste.current,
		});

		// Sync terminal dimensions on visibility change
		const handleVisibilityChange = () => {
			if (document.hidden || isUnmounted) return;
			const prevCols = xterm.cols;
			const prevRows = xterm.rows;
			fitAddon.fit();
			if (xterm.cols !== prevCols || xterm.rows !== prevRows) {
				resizeRef.current({ paneId, cols: xterm.cols, rows: xterm.rows });
			}
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			if (DEBUG_TERMINAL) {
				console.log(`[Terminal] Unmount: ${paneId}`);
			}
			cancelInitialAttach();
			isUnmounted = true;
			sessionRefs.firstStreamDataReceived.current = false;

			if (fallbackTimeout) {
				clearTimeout(fallbackTimeout);
			}

			document.removeEventListener("visibilitychange", handleVisibilityChange);
			inputDisposable.dispose();
			keyDisposable.dispose();
			titleDisposable.dispose();
			cleanupKeyboard();
			cleanupClickToMove();
			cleanupFocus?.();
			cleanupResize();
			cleanupPaste();
			cleanupQuerySuppression();
			cleanupRenderGating();
			unregisterClearCallbackRef.current(paneId);
			unregisterScrollToBottomCallbackRef.current(paneId);
			debouncedSetTabAutoTitleRef.current?.cancel?.();

			// Debounce detach for StrictMode
			const detachTimeout = setTimeout(() => {
				detachRef.current({
					paneId,
					viewportY: getScrollOffsetFromBottom(xterm),
				});
				pendingDetaches.delete(paneId);
				coldRestoreState.delete(paneId);
			}, 50);
			pendingDetaches.set(paneId, detachTimeout);

			sessionRefs.isStreamReady.current = false;
			sessionRefs.didFirstRender.current = false;
			sessionRefs.pendingInitialState.current = null;
			sessionRefs.isAlternateScreen.current = false;
			sessionRefs.isBracketedPaste.current = false;
			sessionRefs.modeScanBuffer.current = "";
			sessionRefs.renderDisposable.current?.dispose();
			sessionRefs.renderDisposable.current = null;

			// Delay xterm.dispose() to let internal timeouts complete
			setTimeout(() => {
				xterm.dispose();
			}, 0);

			xtermRef.current = null;
			searchAddonRef.current = null;
			rendererRef.current = null;
			setXtermInstance(null);
		};
	}, [
		paneId,
		workspaceId,
		flushPendingEvents,
		maybeApplyInitialState,
		setConnectionError,
		sessionRefs,
		handleKeyPress,
		handlePaste,
		resetForNewSession,
		setupFirstRenderGating,
	]);

	// Theme effect
	useEffect(() => {
		const xterm = xtermRef.current;
		if (!xterm || !terminalTheme) return;
		xterm.options.theme = terminalTheme;
	}, [terminalTheme]);

	const terminalBg = terminalTheme?.background ?? getDefaultTerminalBg();

	// Drag and drop handlers
	const handleDragOver = (event: React.DragEvent) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
	};

	const handleDrop = (event: React.DragEvent) => {
		event.preventDefault();
		const files = Array.from(event.dataTransfer.files);
		if (files.length === 0) return;

		const paths = files.map((file) => window.webUtils.getPathForFile(file));
		const text = shellEscapePaths(paths);

		if (!sessionRefs.isExited.current) {
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
			<ScrollToBottomButton terminal={xtermInstance} />
			{exitStatus === "killed" && !connectionError && !isRestoredMode && (
				<KilledOverlay onRestart={handleRestartSession} />
			)}
			{connectionError && (
				<ConnectionErrorOverlay onRetry={handleRetryConnection} />
			)}
			{isRestoredMode && <RestoredOverlay onStartShell={handleStartShell} />}
			<div ref={terminalRef} className="h-full w-full" />
		</div>
	);
};
