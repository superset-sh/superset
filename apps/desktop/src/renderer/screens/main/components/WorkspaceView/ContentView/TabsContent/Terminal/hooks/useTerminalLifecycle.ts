import type { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import type { IDisposable, ITheme, Terminal as XTerm } from "@xterm/xterm";
import type { MutableRefObject, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTabsStore } from "renderer/stores/tabs/store";
import { killTerminalForPane } from "renderer/stores/tabs/utils/terminal-cleanup";
import { isTerminalAttachCanceledMessage } from "../attach-cancel";
import { scheduleTerminalAttach } from "../attach-scheduler";
import { isCommandEchoed, sanitizeForTitle } from "../commandBuffer";
import { DEBUG_TERMINAL, FIRST_RENDER_RESTORE_FALLBACK_MS } from "../config";
import {
	createTerminalInstance,
	setupClickToMoveCursor,
	setupCopyHandler,
	setupFocusListener,
	setupKeyboardHandler,
	setupPasteHandler,
	setupResizeHandlers,
	type TerminalRendererRef,
} from "../helpers";
import { isPaneDestroyed } from "../pane-guards";
import { coldRestoreState, pendingDetaches } from "../state";
import type {
	CreateOrAttachMutate,
	CreateOrAttachResult,
	TerminalCancelCreateOrAttachMutate,
	TerminalClearScrollbackMutate,
	TerminalDetachMutate,
	TerminalResizeMutate,
	TerminalWriteMutate,
} from "../types";
import { scrollToBottom } from "../utils";
import { createAttachRequestId } from "./attach-request-id";
import { shouldKeepAttachAliveOnUnmount } from "./attach-unmount";
import {
	getPaneWorkspaceRun,
	hasPaneWorkspaceRun,
	recoverWorkspaceRunPane,
	resolveWorkspaceRunAttachMode,
	setPaneWorkspaceRunState,
} from "./workspaceRun";

type RegisterCallback = (paneId: string, callback: () => void) => void;
type UnregisterCallback = (paneId: string) => void;

const attachInFlightByPane = new Map<string, number>();
const attachWaitersByPane = new Map<string, Set<() => void>>();

function markAttachInFlight(paneId: string, attachId: number): void {
	attachInFlightByPane.set(paneId, attachId);
}

function clearAttachInFlight(paneId: string, attachId?: number): void {
	if (attachId !== undefined) {
		const current = attachInFlightByPane.get(paneId);
		if (current !== attachId) return;
	}
	attachInFlightByPane.delete(paneId);
	const waiters = attachWaitersByPane.get(paneId);
	if (!waiters) return;
	attachWaitersByPane.delete(paneId);
	for (const waiter of waiters) {
		waiter();
	}
}

function waitForAttachClear(paneId: string, waiter: () => void): () => void {
	if (!attachInFlightByPane.has(paneId)) {
		waiter();
		return () => {};
	}

	let waiters = attachWaitersByPane.get(paneId);
	if (!waiters) {
		waiters = new Set();
		attachWaitersByPane.set(paneId, waiters);
	}
	waiters.add(waiter);

	return () => {
		const current = attachWaitersByPane.get(paneId);
		if (!current) return;
		current.delete(waiter);
		if (current.size === 0) {
			attachWaitersByPane.delete(paneId);
		}
	};
}
export interface UseTerminalLifecycleOptions {
	paneId: string;
	tabIdRef: MutableRefObject<string>;
	workspaceId: string;
	terminalRef: RefObject<HTMLDivElement | null>;
	xtermRef: MutableRefObject<XTerm | null>;
	fitAddonRef: MutableRefObject<FitAddon | null>;
	searchAddonRef: MutableRefObject<SearchAddon | null>;
	rendererRef: MutableRefObject<TerminalRendererRef | null>;
	isExitedRef: MutableRefObject<boolean>;
	wasKilledByUserRef: MutableRefObject<boolean>;
	commandBufferRef: MutableRefObject<string>;
	isFocusedRef: MutableRefObject<boolean>;
	isRestoredModeRef: MutableRefObject<boolean>;
	connectionErrorRef: MutableRefObject<string | null>;
	initialThemeRef: MutableRefObject<ITheme | null>;
	workspaceCwdRef: MutableRefObject<string | null>;
	handleFileLinkClickRef: MutableRefObject<
		(path: string, line?: number, column?: number) => void
	>;
	handleUrlClickRef: MutableRefObject<((url: string) => void) | undefined>;
	paneInitialCwdRef: MutableRefObject<string | undefined>;
	clearPaneInitialDataRef: MutableRefObject<(paneId: string) => void>;
	setConnectionError: (error: string | null) => void;
	setExitStatus: (status: "killed" | "exited" | null) => void;
	setIsRestoredMode: (value: boolean) => void;
	setRestoredCwd: (cwd: string | null) => void;
	createOrAttachRef: MutableRefObject<CreateOrAttachMutate>;
	writeRef: MutableRefObject<TerminalWriteMutate>;
	resizeRef: MutableRefObject<TerminalResizeMutate>;
	detachRef: MutableRefObject<TerminalDetachMutate>;
	cancelCreateOrAttachRef: MutableRefObject<TerminalCancelCreateOrAttachMutate>;
	clearScrollbackRef: MutableRefObject<TerminalClearScrollbackMutate>;
	isStreamReadyRef: MutableRefObject<boolean>;
	didFirstRenderRef: MutableRefObject<boolean>;
	pendingInitialStateRef: MutableRefObject<CreateOrAttachResult | null>;
	maybeApplyInitialState: () => void;
	flushPendingEvents: () => void;
	resetModes: () => void;
	isAlternateScreenRef: MutableRefObject<boolean>;
	isBracketedPasteRef: MutableRefObject<boolean>;
	setPaneNameRef: MutableRefObject<(paneId: string, name: string) => void>;
	renameUnnamedWorkspaceRef: MutableRefObject<(title: string) => void>;
	handleTerminalFocusRef: MutableRefObject<() => void>;
	registerClearCallbackRef: MutableRefObject<RegisterCallback>;
	unregisterClearCallbackRef: MutableRefObject<UnregisterCallback>;
	registerScrollToBottomCallbackRef: MutableRefObject<RegisterCallback>;
	unregisterScrollToBottomCallbackRef: MutableRefObject<UnregisterCallback>;
	registerGetSelectionCallbackRef: MutableRefObject<
		(paneId: string, callback: () => string) => void
	>;
	unregisterGetSelectionCallbackRef: MutableRefObject<UnregisterCallback>;
	registerPasteCallbackRef: MutableRefObject<
		(paneId: string, callback: (text: string) => void) => void
	>;
	unregisterPasteCallbackRef: MutableRefObject<UnregisterCallback>;
	defaultRestartCommandRef: MutableRefObject<string | undefined>;
}

export interface UseTerminalLifecycleReturn {
	xtermInstance: XTerm | null;
	restartTerminal: (options?: {
		command?: string;
		forceRestart?: boolean;
	}) => Promise<void>;
}

export function useTerminalLifecycle({
	paneId,
	tabIdRef,
	workspaceId,
	terminalRef,
	xtermRef,
	fitAddonRef,
	searchAddonRef,
	rendererRef,
	isExitedRef,
	wasKilledByUserRef,
	commandBufferRef,
	isFocusedRef,
	isRestoredModeRef,
	connectionErrorRef,
	initialThemeRef,
	workspaceCwdRef,
	handleFileLinkClickRef,
	handleUrlClickRef,
	paneInitialCwdRef,
	clearPaneInitialDataRef,
	setConnectionError,
	setExitStatus,
	setIsRestoredMode,
	setRestoredCwd,
	createOrAttachRef,
	writeRef,
	resizeRef,
	detachRef,
	cancelCreateOrAttachRef,
	clearScrollbackRef,
	isStreamReadyRef,
	didFirstRenderRef,
	pendingInitialStateRef,
	maybeApplyInitialState,
	flushPendingEvents,
	resetModes,
	isAlternateScreenRef,
	isBracketedPasteRef,
	setPaneNameRef,
	renameUnnamedWorkspaceRef,
	handleTerminalFocusRef,
	registerClearCallbackRef,
	unregisterClearCallbackRef,
	registerScrollToBottomCallbackRef,
	unregisterScrollToBottomCallbackRef,
	registerGetSelectionCallbackRef,
	unregisterGetSelectionCallbackRef,
	registerPasteCallbackRef,
	unregisterPasteCallbackRef,
	defaultRestartCommandRef,
}: UseTerminalLifecycleOptions): UseTerminalLifecycleReturn {
	const [xtermInstance, setXtermInstance] = useState<XTerm | null>(null);
	const restartTerminalRef = useRef<
		(options?: { command?: string; forceRestart?: boolean }) => Promise<void>
	>(() => Promise.resolve());
	const restartTerminal = useCallback(
		(options?: { command?: string; forceRestart?: boolean }) =>
			restartTerminalRef.current(options),
		[],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refs used intentionally
	useEffect(() => {
		const container = terminalRef.current;
		if (!container) return;

		if (DEBUG_TERMINAL) {
			console.log(`[Terminal] Mount: ${paneId}`);
		}

		// Cancel pending detach from previous unmount
		const pendingDetach = pendingDetaches.get(paneId);
		if (pendingDetach) {
			clearTimeout(pendingDetach);
			pendingDetaches.delete(paneId);
		}

		let isUnmounted = false;
		let attachCanceled = false;
		let attachSequence = 0;
		let activeAttachId = 0;
		let activeAttachRequestId: string | null = null;
		let cancelAttachWait: (() => void) | null = null;

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
			onUrlClickRef: handleUrlClickRef,
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

		if (!isUnmounted) {
			const searchAddon = new SearchAddon();
			xterm.loadAddon(searchAddon);
			searchAddonRef.current = searchAddon;
		}

		// Wait for first render before applying restoration
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

		const nextAttachRequestId = () => createAttachRequestId(paneId);
		const cancelAttachRequest = (requestId: string | null) => {
			if (!requestId) return;
			cancelCreateOrAttachRef.current({ paneId, requestId });
		};

		const restartTerminalSession = (options?: {
			command?: string;
			forceRestart?: boolean;
		}) =>
			new Promise<void>((resolve, reject) => {
				const command = options?.command ?? defaultRestartCommandRef.current;
				const workspaceRun = getPaneWorkspaceRun(paneId);
				isExitedRef.current = false;
				isStreamReadyRef.current = false;
				wasKilledByUserRef.current = false;
				setExitStatus(null);
				resetModes();
				xterm.clear();
				if (workspaceRun && command) {
					setPaneWorkspaceRunState(paneId, "running");
				}
				const attach = () => {
					const requestId = nextAttachRequestId();
					cancelAttachRequest(activeAttachRequestId);
					activeAttachRequestId = requestId;
					createOrAttachRef.current(
						{
							paneId,
							requestId,
							tabId: tabIdRef.current,
							workspaceId,
							cols: xterm.cols,
							rows: xterm.rows,
							skipColdRestore: true,
							allowKilled: true,
							command,
						},
						{
							onSuccess: (result) => {
								if (activeAttachRequestId !== requestId) {
									resolve();
									return;
								}
								setConnectionError(null);
								pendingInitialStateRef.current = result;
								maybeApplyInitialState();
								resolve();
							},
							onError: (error) => {
								if (activeAttachRequestId !== requestId) {
									resolve();
									return;
								}
								if (isTerminalAttachCanceledMessage(error.message)) {
									resolve();
									return;
								}
								console.error("[Terminal] Failed to restart:", error);
								if (workspaceRun) {
									setPaneWorkspaceRunState(paneId, "stopped-by-exit");
								}
								setConnectionError(
									error.message || "Failed to restart terminal",
								);
								isStreamReadyRef.current = true;
								flushPendingEvents();
								reject(error);
							},
							onSettled: () => {
								if (activeAttachRequestId === requestId) {
									activeAttachRequestId = null;
								}
							},
						},
					);
				};

				if (options?.forceRestart) {
					void electronTrpcClient.terminal.kill
						.mutate({ paneId })
						.catch((err) => {
							console.warn("[Terminal] Kill failed before restart:", err);
						})
						.finally(attach);
					return;
				}
				attach();
			});

		restartTerminalRef.current = restartTerminalSession;

		const handleTerminalInput = (data: string) => {
			if (isRestoredModeRef.current || connectionErrorRef.current) return;
			if (isExitedRef.current) {
				const isWorkspaceRunPane = hasPaneWorkspaceRun(paneId);
				if (
					!isFocusedRef.current ||
					(wasKilledByUserRef.current && !isWorkspaceRunPane)
				) {
					return;
				}
				// For workspace-run panes, don't restart until the run command
				// has been resolved via tRPC query — otherwise we'd start a
				// plain interactive shell instead of the configured command.
				if (isWorkspaceRunPane && !defaultRestartCommandRef.current) {
					return;
				}
				void restartTerminalSession();
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
					const buffer = commandBufferRef.current;
					if (isCommandEchoed(xterm, buffer)) {
						const title = sanitizeForTitle(buffer);
						if (title) {
							setPaneNameRef.current(paneId, title);
						}
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

		const initialCwd = paneInitialCwdRef.current;

		const { workspaceRun: paneWorkspaceRun, isNewWorkspaceRun } =
			resolveWorkspaceRunAttachMode(paneId, defaultRestartCommandRef.current);

		const cancelInitialAttach = scheduleTerminalAttach({
			paneId,
			priority: isFocusedRef.current ? 0 : 1,
			run: (done) => {
				const startAttach = () => {
					if (attachCanceled) return;
					if (attachInFlightByPane.has(paneId)) {
						cancelAttachWait = waitForAttachClear(paneId, () => {
							if (attachCanceled || isUnmounted) return;
							startAttach();
						});
						return;
					}

					const requestId = nextAttachRequestId();
					cancelAttachRequest(activeAttachRequestId);
					activeAttachRequestId = requestId;
					activeAttachId = ++attachSequence;
					const attachId = activeAttachId;
					const isAttachActive = () =>
						!isUnmounted && !attachCanceled && attachId === activeAttachId;

					markAttachInFlight(paneId, attachId);

					const finishAttach = () => {
						clearAttachInFlight(paneId, attachId);
						done();
					};

					if (DEBUG_TERMINAL) {
						console.log(`[Terminal] createOrAttach start: ${paneId}`);
					}
					createOrAttachRef.current(
						{
							paneId,
							requestId,
							tabId: tabIdRef.current,
							workspaceId,
							cols: xterm.cols,
							rows: xterm.rows,
							cwd: initialCwd,
							...(isNewWorkspaceRun && {
								command: defaultRestartCommandRef.current,
								skipColdRestore: true,
							}),
						},
						{
							onSuccess: (result) => {
								if (!isAttachActive()) return;
								if (activeAttachRequestId !== requestId) return;
								setConnectionError(null);
								clearPaneInitialDataRef.current(paneId);

								const storedColdRestore = coldRestoreState.get(paneId);
								if (storedColdRestore?.isRestored) {
									setIsRestoredMode(true);
									setRestoredCwd(storedColdRestore.cwd);
									if (storedColdRestore.scrollback && xterm) {
										xterm.write(
											storedColdRestore.scrollback,
											scheduleScrollToBottom,
										);
									}
									didFirstRenderRef.current = true;
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
									setIsRestoredMode(true);
									setRestoredCwd(result.previousCwd || null);
									if (scrollback && xterm) {
										xterm.write(scrollback, scheduleScrollToBottom);
									}
									didFirstRenderRef.current = true;
									return;
								}

								pendingInitialStateRef.current = result;
								maybeApplyInitialState();
							},
							onError: (error) => {
								if (!isAttachActive()) return;
								if (activeAttachRequestId !== requestId) return;
								if (isTerminalAttachCanceledMessage(error.message)) {
									return;
								}
								const workspaceRun = getPaneWorkspaceRun(paneId);
								if (error.message?.includes("TERMINAL_SESSION_KILLED")) {
									if (workspaceRun) {
										setPaneWorkspaceRunState(paneId, "stopped-by-user");
									}
									wasKilledByUserRef.current = true;
									isExitedRef.current = true;
									isStreamReadyRef.current = false;
									setExitStatus("killed");
									setConnectionError(null);
									return;
								}
								console.error("[Terminal] Failed to create/attach:", error);
								if (workspaceRun) {
									setPaneWorkspaceRunState(paneId, "stopped-by-exit");
								}
								setConnectionError(
									error.message || "Failed to connect to terminal",
								);
								isStreamReadyRef.current = true;
								flushPendingEvents();
							},
							onSettled: () => {
								if (activeAttachRequestId === requestId) {
									activeAttachRequestId = null;
								}
								finishAttach();
							},
						},
					);
				};

				// Handle workspace-run panes that need recovery (stopped or stale "running" after restart)
				if (paneWorkspaceRun && !isNewWorkspaceRun) {
					void recoverWorkspaceRunPane({
						paneId,
						workspaceRun: paneWorkspaceRun,
						isNewWorkspaceRun,
						xterm,
						shouldAbort: () => isUnmounted || attachCanceled,
						startAttach,
						done,
						isExitedRef,
						wasKilledByUserRef,
						isStreamReadyRef,
						setExitStatus,
					});
					return;
				}

				startAttach();
				return;
			},
		});

		const inputDisposable = xterm.onData(handleTerminalInput);
		const keyDisposable = xterm.onKey(handleKeyPress);
		const titleDisposable = xterm.onTitleChange((title) => {
			if (title) {
				setPaneNameRef.current(paneId, title);
				renameUnnamedWorkspaceRef.current(title);
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

		const handleGetSelection = () => {
			const selection = xterm.getSelection();
			if (!selection) return "";
			return selection
				.split("\n")
				.map((line) => line.trimEnd())
				.join("\n");
		};

		const handlePaste = (text: string) => {
			if (isExitedRef.current) return;
			xterm.paste(text);
		};

		registerGetSelectionCallbackRef.current(paneId, handleGetSelection);
		registerPasteCallbackRef.current(paneId, handlePaste);

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
		const cleanupCopy = setupCopyHandler(xterm);
		const reattachRecovery = {
			throttleMs: 120,
			pendingFrame: null as number | null,
			lastRunAt: 0,
			pendingForceResize: false,
		};

		const isCurrentTerminalRenderable = () => {
			if (isUnmounted || xtermRef.current !== xterm) return false;
			if (!container.isConnected) return false;

			const style = window.getComputedStyle(container);
			if (style.display === "none" || style.visibility === "hidden") {
				return false;
			}

			const rect = container.getBoundingClientRect();
			return rect.width > 1 && rect.height > 1;
		};

		const runReattachRecovery = (forceResize: boolean) => {
			if (!isCurrentTerminalRenderable()) return;

			const prevCols = xterm.cols;
			const prevRows = xterm.rows;
			const wasAtBottom =
				xterm.buffer.active.viewportY >= xterm.buffer.active.baseY;

			// Rebuild stale WebGL glyph cache after occlusion and force a paint pass.
			rendererRef.current?.current.clearTextureAtlas?.();

			fitAddon.fit();
			xterm.refresh(0, Math.max(0, xterm.rows - 1));

			if (forceResize || xterm.cols !== prevCols || xterm.rows !== prevRows) {
				resizeRef.current({ paneId, cols: xterm.cols, rows: xterm.rows });
			}

			if (isFocusedRef.current && document.hasFocus()) {
				xterm.focus();
			}

			if (!wasAtBottom) return;
			requestAnimationFrame(() => {
				if (isUnmounted || xtermRef.current !== xterm) return;
				scrollToBottom(xterm);
			});
		};

		const scheduleReattachRecovery = (forceResize: boolean) => {
			reattachRecovery.pendingForceResize ||= forceResize;
			if (reattachRecovery.pendingFrame !== null) return;

			reattachRecovery.pendingFrame = requestAnimationFrame(() => {
				reattachRecovery.pendingFrame = null;

				const now = Date.now();
				if (now - reattachRecovery.lastRunAt < reattachRecovery.throttleMs) {
					// Schedule a retry after the remaining throttle window so the recovery
					// is not permanently lost when focus events fire in rapid succession.
					const remaining =
						reattachRecovery.throttleMs - (now - reattachRecovery.lastRunAt);
					setTimeout(() => {
						if (!isUnmounted)
							scheduleReattachRecovery(reattachRecovery.pendingForceResize);
					}, remaining + 1);
					return;
				}
				reattachRecovery.lastRunAt = now;

				const shouldForceResize = reattachRecovery.pendingForceResize;
				reattachRecovery.pendingForceResize = false;
				runReattachRecovery(shouldForceResize);
			});
		};

		const cancelReattachRecovery = () => {
			if (reattachRecovery.pendingFrame === null) return;
			cancelAnimationFrame(reattachRecovery.pendingFrame);
			reattachRecovery.pendingFrame = null;
		};

		const handleVisibilityChange = () => {
			if (document.hidden) return;
			scheduleReattachRecovery(isFocusedRef.current);
		};
		const handleWindowFocus = () => {
			scheduleReattachRecovery(isFocusedRef.current);
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("focus", handleWindowFocus);

		const isPaneDestroyedInStore = () =>
			isPaneDestroyed(useTabsStore.getState().panes, paneId);

		return () => {
			if (DEBUG_TERMINAL) {
				console.log(`[Terminal] Unmount: ${paneId}`);
			}
			const paneDestroyed = isPaneDestroyedInStore();
			const hasWorkspaceRun = hasPaneWorkspaceRun(paneId);
			const keepAttachAlive = shouldKeepAttachAliveOnUnmount({
				paneDestroyed,
				hasWorkspaceRun,
				isStartingWorkspaceRun: isNewWorkspaceRun,
				hasActiveAttachRequest: activeAttachRequestId !== null,
			});

			if (!keepAttachAlive) {
				cancelInitialAttach();
			}
			isUnmounted = true;
			attachCanceled = !keepAttachAlive;
			if (!keepAttachAlive) {
				cancelAttachRequest(activeAttachRequestId);
			}
			activeAttachRequestId = null;
			const cleanupAttachId = !keepAttachAlive
				? activeAttachId || undefined
				: undefined;
			activeAttachId = 0;
			if (cancelAttachWait) {
				cancelAttachWait();
				cancelAttachWait = null;
			}
			if (!keepAttachAlive) {
				clearAttachInFlight(paneId, cleanupAttachId);
			}
			if (firstRenderFallback) clearTimeout(firstRenderFallback);
			cancelReattachRecovery();
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("focus", handleWindowFocus);
			inputDisposable.dispose();
			keyDisposable.dispose();
			titleDisposable.dispose();
			cleanupKeyboard();
			cleanupClickToMove();
			cleanupFocus?.();
			cleanupResize();
			cleanupPaste();
			cleanupCopy();
			cleanupQuerySuppression();
			unregisterClearCallbackRef.current(paneId);
			unregisterScrollToBottomCallbackRef.current(paneId);
			unregisterGetSelectionCallbackRef.current(paneId);
			unregisterPasteCallbackRef.current(paneId);

			if (paneDestroyed) {
				// Pane was explicitly destroyed, so kill the session.
				killTerminalForPane(paneId);
				coldRestoreState.delete(paneId);
				pendingDetaches.delete(paneId);
			} else if (hasWorkspaceRun) {
				// Keep workspace-run panes attached while hidden
				pendingDetaches.delete(paneId);
			} else {
				const detachTimeout = setTimeout(() => {
					detachRef.current({ paneId });
					pendingDetaches.delete(paneId);
					coldRestoreState.delete(paneId);
				}, 50);
				pendingDetaches.set(paneId, detachTimeout);
			}

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
	]);

	return { xtermInstance, restartTerminal };
}
