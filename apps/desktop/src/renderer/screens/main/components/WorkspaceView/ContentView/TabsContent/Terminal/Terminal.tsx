import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { IDisposable, Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import debounce from "lodash/debounce";
import { useCallback, useEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	clearTerminalKilledByUser,
	isTerminalKilledByUser,
} from "renderer/lib/terminal-kill-tracking";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useTerminalCallbacksStore } from "renderer/stores/tabs/terminal-callbacks";
import { useTerminalTheme } from "renderer/stores/theme";
import { scheduleTerminalAttach } from "./attach-scheduler";
import { sanitizeForTitle } from "./commandBuffer";
import { ConnectionErrorOverlay, SessionKilledOverlay } from "./components";
import { DEBUG_TERMINAL, FIRST_RENDER_RESTORE_FALLBACK_MS } from "./config";
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
	useFileLinkClick,
	useTerminalColdRestore,
	useTerminalConnection,
	useTerminalCwd,
	useTerminalModes,
	useTerminalRestore,
	useTerminalStream,
} from "./hooks";
import { ScrollToBottomButton } from "./ScrollToBottomButton";
import { coldRestoreState, pendingDetaches } from "./state";
import { TerminalSearch } from "./TerminalSearch";
import type { TerminalProps, TerminalStreamEvent } from "./types";
import { scrollToBottom, shellEscapePaths } from "./utils";

export const Terminal = ({ tabId, workspaceId }: TerminalProps) => {
	const paneId = tabId;
	const pane = useTabsStore((s) => s.panes[paneId]);
	const paneInitialCommands = pane?.initialCommands;
	const paneInitialCwd = pane?.initialCwd;
	const clearPaneInitialData = useTabsStore((s) => s.clearPaneInitialData);
	const parentTabId = pane?.tabId;
	const terminalRef = useRef<HTMLDivElement>(null);
	const xtermRef = useRef<XTerm | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const searchAddonRef = useRef<SearchAddon | null>(null);
	const rendererRef = useRef<TerminalRendererRef | null>(null);
	const isExitedRef = useRef(false);
	const [exitStatus, setExitStatus] = useState<"killed" | "exited" | null>(
		null,
	);
	const wasKilledByUserRef = useRef(false);
	const pendingEventsRef = useRef<TerminalStreamEvent[]>([]);
	const commandBufferRef = useRef("");
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [xtermInstance, setXtermInstance] = useState<XTerm | null>(null);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const setTabAutoTitle = useTabsStore((s) => s.setTabAutoTitle);
	const focusedPaneId = useTabsStore(
		(s) => s.focusedPaneIds[pane?.tabId ?? ""],
	);
	const terminalTheme = useTerminalTheme();
	const restartTerminalRef = useRef<() => void>(() => {});

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

	const { updateCwdFromData } = useTerminalCwd({
		paneId,
		initialCwd: paneInitialCwd,
		workspaceCwd,
	});

	const {
		isAlternateScreenRef,
		isBracketedPasteRef,
		modeScanBufferRef,
		updateModesFromData,
		resetModes,
	} = useTerminalModes();

	const { handleFileLinkClick } = useFileLinkClick({
		workspaceId,
		workspaceCwd,
	});

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

	const workspaceCwdRef = useRef(workspaceCwd);
	workspaceCwdRef.current = workspaceCwd;

	const handleFileLinkClickRef = useRef(handleFileLinkClick);
	handleFileLinkClickRef.current = handleFileLinkClick;

	const handleTerminalExitRef = useRef<
		(exitCode: number, xterm: XTerm) => void
	>(() => {});
	const handleStreamErrorRef = useRef<
		(
			event: Extract<TerminalStreamEvent, { type: "error" }>,
			xterm: XTerm,
		) => void
	>(() => {});

	const parentTabIdRef = useRef(parentTabId);
	parentTabIdRef.current = parentTabId;

	const setTabAutoTitleRef = useRef(setTabAutoTitle);
	setTabAutoTitleRef.current = setTabAutoTitle;

	const debouncedSetTabAutoTitleRef = useRef(
		debounce((tabId: string, title: string) => {
			setTabAutoTitleRef.current(tabId, title);
		}, 100),
	);

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

	const {
		isStreamReadyRef,
		didFirstRenderRef,
		pendingInitialStateRef,
		maybeApplyInitialState,
		flushPendingEvents,
	} = useTerminalRestore({
		paneId,
		xtermRef,
		fitAddonRef,
		pendingEventsRef,
		isAlternateScreenRef,
		isBracketedPasteRef,
		modeScanBufferRef,
		updateCwdFromData,
		updateModesFromData,
		onExitEvent: (exitCode, xterm) =>
			handleTerminalExitRef.current(exitCode, xterm),
		onErrorEvent: (event, xterm) => handleStreamErrorRef.current(event, xterm),
		onDisconnectEvent: (reason) =>
			setConnectionError(reason || "Connection to terminal daemon lost"),
	});

	const {
		isRestoredMode,
		setIsRestoredMode,
		setRestoredCwd,
		handleRetryConnection,
		handleStartShell,
	} = useTerminalColdRestore({
		paneId,
		workspaceId,
		parentTabIdRef,
		xtermRef,
		fitAddonRef,
		isStreamReadyRef,
		isExitedRef,
		wasKilledByUserRef,
		isFocusedRef,
		didFirstRenderRef,
		pendingInitialStateRef,
		pendingEventsRef,
		createOrAttachRef,
		setConnectionError,
		setExitStatus,
		maybeApplyInitialState,
		flushPendingEvents,
		resetModes,
	});

	const isRestoredModeRef = useRef(isRestoredMode);
	isRestoredModeRef.current = isRestoredMode;
	const connectionErrorRef = useRef(connectionError);
	connectionErrorRef.current = connectionError;

	const { handleTerminalExit, handleStreamError, handleStreamData } =
		useTerminalStream({
			paneId,
			xtermRef,
			isStreamReadyRef,
			isExitedRef,
			wasKilledByUserRef,
			pendingEventsRef,
			setExitStatus,
			setConnectionError,
			updateModesFromData,
			updateCwdFromData,
		});

	handleTerminalExitRef.current = handleTerminalExit;
	handleStreamErrorRef.current = handleStreamError;

	electronTrpc.terminal.stream.useSubscription(paneId, {
		onData: handleStreamData,
		enabled: true,
	});

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
		const xterm = xtermRef.current;
		if (!xterm) return;
		if (isFocused) {
			xterm.focus();
		}
	}, [isFocused]);

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

	// biome-ignore lint/correctness/useExhaustiveDependencies: refs used intentionally
	useEffect(() => {
		const container = terminalRef.current;
		if (!container) return;

		if (DEBUG_TERMINAL) {
			console.log(`[Terminal] Mount: ${paneId}`);
		}

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

		const scheduleScrollToBottom = () => {
			requestAnimationFrame(() => {
				if (isUnmounted || xtermRef.current !== xterm) return;
				scrollToBottom(xterm);
			});
		};
		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;
		rendererRef.current = renderer;
		isExitedRef.current = false;
		setXtermInstance(xterm);
		isStreamReadyRef.current = false;
		didFirstRenderRef.current = false;
		pendingInitialStateRef.current = null;

		if (isFocusedRef.current) {
			xterm.focus();
		}

		import("@xterm/addon-search").then(({ SearchAddon }) => {
			if (isUnmounted) return;
			const searchAddon = new SearchAddon();
			xterm.loadAddon(searchAddon);
			searchAddonRef.current = searchAddon;
		});

		let renderDisposable: IDisposable | null = null;
		let firstRenderFallback: ReturnType<typeof setTimeout> | null = null;

		renderDisposable = xterm.onRender(() => {
			if (firstRenderFallback) {
				clearTimeout(firstRenderFallback);
				firstRenderFallback = null;
			}
			renderDisposable?.dispose();
			renderDisposable = null;
			didFirstRenderRef.current = true;
			maybeApplyInitialState();
		});

		firstRenderFallback = setTimeout(() => {
			if (isUnmounted || didFirstRenderRef.current) return;
			didFirstRenderRef.current = true;
			maybeApplyInitialState();
		}, FIRST_RENDER_RESTORE_FALLBACK_MS);

		const restartTerminal = () => {
			isExitedRef.current = false;
			isStreamReadyRef.current = false;
			wasKilledByUserRef.current = false;
			setExitStatus(null);
			clearTerminalKilledByUser(paneId);
			resetModes();
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
						pendingInitialStateRef.current = result;
						maybeApplyInitialState();
					},
					onError: (error) => {
						console.error("[Terminal] Failed to restart:", error);
						setConnectionError(error.message || "Failed to restart terminal");
						isStreamReadyRef.current = true;
						flushPendingEvents();
					},
				},
			);
		};
		restartTerminalRef.current = restartTerminal;

		const handleTerminalInput = (data: string) => {
			if (isRestoredModeRef.current || connectionErrorRef.current) return;
			if (isExitedRef.current) {
				if (!isFocusedRef.current || wasKilledByUserRef.current) return;
				restartTerminal();
				return;
			}
			writeRef.current({ paneId, data });
		};

		const handleKeyPress = (event: {
			key: string;
			domEvent: KeyboardEvent;
		}) => {
			if (isRestoredModeRef.current || connectionErrorRef.current) return;
			const { domEvent } = event;
			if (domEvent.key === "Enter") {
				if (!isAlternateScreenRef.current) {
					const title = sanitizeForTitle(commandBufferRef.current);
					if (title && parentTabIdRef.current) {
						debouncedSetTabAutoTitleRef.current(parentTabIdRef.current, title);
					}
				}
				commandBufferRef.current = "";
			} else if (domEvent.key === "Backspace") {
				commandBufferRef.current = commandBufferRef.current.slice(0, -1);
			} else if (domEvent.key === "c" && domEvent.ctrlKey) {
				commandBufferRef.current = "";
				const currentPane = useTabsStore.getState().panes[paneId];
				if (
					currentPane?.status === "working" ||
					currentPane?.status === "permission"
				) {
					useTabsStore.getState().setPaneStatus(paneId, "idle");
				}
			} else if (domEvent.key === "Escape") {
				const currentPane = useTabsStore.getState().panes[paneId];
				if (
					currentPane?.status === "working" ||
					currentPane?.status === "permission"
				) {
					useTabsStore.getState().setPaneStatus(paneId, "idle");
				}
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

		const cancelInitialAttach = scheduleTerminalAttach({
			paneId,
			priority: isFocusedRef.current ? 0 : 1,
			run: (done) => {
				if (isTerminalKilledByUser(paneId)) {
					wasKilledByUserRef.current = true;
					isExitedRef.current = true;
					isStreamReadyRef.current = false;
					setExitStatus("killed");
					done();
					return;
				}
				if (DEBUG_TERMINAL) {
					console.log(`[Terminal] createOrAttach start: ${paneId}`);
				}
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
							if (initialCommands || initialCwd) {
								clearPaneInitialDataRef.current(paneId);
							}

							const storedColdRestore = coldRestoreState.get(paneId);
							if (storedColdRestore?.isRestored) {
								if (storedColdRestore.scrollback && xterm) {
									xterm.write(
										storedColdRestore.scrollback,
										scheduleScrollToBottom,
									);
								}
								didFirstRenderRef.current = true;
								handleStartShell(storedColdRestore.cwd);
								return;
							}

							if (result.isColdRestore) {
								const scrollback =
									result.snapshot?.snapshotAnsi ?? result.scrollback;
								coldRestoreState.set(paneId, {
									isRestored: true,
									cwd: result.previousCwd || null,
									scrollback,
								});
								if (scrollback && xterm) {
									xterm.write(scrollback, scheduleScrollToBottom);
								}
								didFirstRenderRef.current = true;
								handleStartShell(result.previousCwd || null);
								return;
							}

							pendingInitialStateRef.current = result;
							maybeApplyInitialState();
						},
						onError: (error) => {
							if (error.message?.includes("TERMINAL_SESSION_KILLED")) {
								wasKilledByUserRef.current = true;
								isExitedRef.current = true;
								isStreamReadyRef.current = false;
								setExitStatus("killed");
								setConnectionError(null);
								return;
							}
							console.error("[Terminal] Failed to create/attach:", error);
							setConnectionError(
								error.message || "Failed to connect to terminal",
							);
							isStreamReadyRef.current = true;
							flushPendingEvents();
						},
						onSettled: () => done(),
					},
				);
			},
		});

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

		const handleScrollToBottom = () => scrollToBottom(xterm);

		const handleWrite = (data: string) => {
			if (isExitedRef.current) return;
			writeRef.current({ paneId, data });
		};

		const cleanupKeyboard = setupKeyboardHandler(xterm, {
			onShiftEnter: () => handleWrite("\x1b\r"),
			onClear: handleClear,
			onWrite: handleWrite,
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
			(cols, rows) => resizeRef.current({ paneId, cols, rows }),
		);
		const cleanupPaste = setupPasteHandler(xterm, {
			onPaste: (text) => {
				commandBufferRef.current += text;
			},
			onWrite: handleWrite,
			isBracketedPasteEnabled: () => isBracketedPasteRef.current,
		});

		const handleVisibilityChange = () => {
			if (document.hidden || isUnmounted) return;
			const buffer = xterm.buffer.active;
			const wasAtBottom = buffer.viewportY >= buffer.baseY;
			const prevCols = xterm.cols;
			const prevRows = xterm.rows;
			fitAddon.fit();
			if (xterm.cols !== prevCols || xterm.rows !== prevRows) {
				resizeRef.current({ paneId, cols: xterm.cols, rows: xterm.rows });
			}
			if (wasAtBottom) {
				requestAnimationFrame(() => {
					if (isUnmounted || xtermRef.current !== xterm) return;
					scrollToBottom(xterm);
				});
			}
		};
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			if (DEBUG_TERMINAL) {
				console.log(`[Terminal] Unmount: ${paneId}`);
			}
			cancelInitialAttach();
			isUnmounted = true;
			if (firstRenderFallback) clearTimeout(firstRenderFallback);
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
			unregisterClearCallbackRef.current(paneId);
			unregisterScrollToBottomCallbackRef.current(paneId);
			debouncedSetTabAutoTitleRef.current?.cancel?.();

			const detachTimeout = setTimeout(() => {
				detachRef.current({ paneId });
				pendingDetaches.delete(paneId);
				coldRestoreState.delete(paneId);
			}, 50);
			pendingDetaches.set(paneId, detachTimeout);

			isStreamReadyRef.current = false;
			didFirstRenderRef.current = false;
			pendingInitialStateRef.current = null;
			resetModes();
			renderDisposable?.dispose();

			setTimeout(() => xterm.dispose(), 0);

			xtermRef.current = null;
			searchAddonRef.current = null;
			rendererRef.current = null;
			setXtermInstance(null);
		};
	}, [
		paneId,
		workspaceId,
		maybeApplyInitialState,
		flushPendingEvents,
		setConnectionError,
		resetModes,
		setIsRestoredMode,
		setRestoredCwd,
		handleTerminalExit,
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
		const paths = files.map((file) => window.webUtils.getPathForFile(file));
		const text = shellEscapePaths(paths);
		if (!isExitedRef.current) {
			writeRef.current({ paneId, data: text });
		}
	};

	const handleRestartSession = useCallback(() => {
		restartTerminalRef.current();
	}, []);

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
				<SessionKilledOverlay onRestart={handleRestartSession} />
			)}
			{connectionError && (
				<ConnectionErrorOverlay onRetry={handleRetryConnection} />
			)}
			<div ref={terminalRef} className="h-full w-full" />
		</div>
	);
};
