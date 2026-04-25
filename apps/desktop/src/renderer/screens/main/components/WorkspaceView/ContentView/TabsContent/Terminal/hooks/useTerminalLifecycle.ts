import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { IDisposable, ITheme, Terminal as XTerm } from "@xterm/xterm";
import type { MutableRefObject, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { writeCommandInPane } from "renderer/lib/terminal/launch-command";
import type { DetectedLink } from "renderer/lib/terminal/links";
import {
	clearTerminalSessionReady,
	markTerminalSessionReady,
	rejectTerminalSessionReady,
} from "renderer/lib/terminal/session-readiness";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTabsStore } from "renderer/stores/tabs/store";
import { killTerminalForPane } from "renderer/stores/tabs/utils/terminal-cleanup";
import { isTerminalAttachCanceledMessage } from "../attach-cancel";
import { scheduleTerminalAttach } from "../attach-scheduler";
import { isCommandEchoed, sanitizeForTitle } from "../commandBuffer";
import { DEBUG_TERMINAL, FIRST_RENDER_RESTORE_FALLBACK_MS } from "../config";
import {
	setupClickToMoveCursor,
	setupCopyHandler,
	setupFocusListener,
} from "../helpers";
import { isPaneDestroyed } from "../pane-guards";
import { coldRestoreState, pendingDetaches } from "../state";
import { setupKeyboardHandler } from "../terminalKeyboardHandler";
import type {
	CreateOrAttachMutate,
	CreateOrAttachResult,
	TerminalCancelCreateOrAttachMutate,
	TerminalClearScrollbackMutate,
	TerminalResizeMutate,
	TerminalWriteMutate,
} from "../types";
import { scrollToBottom } from "../utils";
import * as v1TerminalCache from "../v1-terminal-cache";
import { createAttachRequestId } from "./attach-request-id";
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
	isExitedRef: MutableRefObject<boolean>;
	wasKilledByUserRef: MutableRefObject<boolean>;
	commandBufferRef: MutableRefObject<string>;
	isFocusedRef: MutableRefObject<boolean>;
	isRestoredModeRef: MutableRefObject<boolean>;
	connectionErrorRef: MutableRefObject<string | null>;
	initialThemeRef: MutableRefObject<ITheme | null>;
	handleFileLinkClickRef: MutableRefObject<
		(event: MouseEvent, link: DetectedLink) => void
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
	cancelCreateOrAttachRef: MutableRefObject<TerminalCancelCreateOrAttachMutate>;
	clearScrollbackRef: MutableRefObject<TerminalClearScrollbackMutate>;
	isStreamReadyRef: MutableRefObject<boolean>;
	didFirstRenderRef: MutableRefObject<boolean>;
	pendingInitialStateRef: MutableRefObject<CreateOrAttachResult | null>;
	maybeApplyInitialState: () => void;
	flushPendingEvents: () => void;
	resetModes: () => void;
	isAlternateScreenRef: MutableRefObject<boolean>;
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
	isExitedRef,
	wasKilledByUserRef,
	commandBufferRef,
	isFocusedRef,
	isRestoredModeRef,
	connectionErrorRef,
	initialThemeRef,
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
	cancelCreateOrAttachRef,
	clearScrollbackRef,
	isStreamReadyRef,
	didFirstRenderRef,
	pendingInitialStateRef,
	maybeApplyInitialState,
	flushPendingEvents,
	resetModes,
	isAlternateScreenRef,
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

		// Use the v1 terminal cache: reuse existing xterm instance across tab
		// switches instead of creating/disposing each time (v2 "hide attach" pattern).
		// Only treat as reattach when the prior mount actually completed attach —
		// a cache entry can exist with streamReady=false if the previous mount
		// unmounted before createOrAttach finished (e.g. bulk tab creation where
		// React remounts a pane mid-attach). Taking the reattach fast path in
		// that state leaves the pane permanently disconnected with no daemon
		// session and no stream subscription.
		const cachedBeforeCreate = v1TerminalCache.get(paneId);
		const isReattach = cachedBeforeCreate?.streamReady === true;
		if (DEBUG_TERMINAL) {
			console.log(`[Terminal] isReattach=${isReattach} paneId=${paneId}`);
		}
		const cached = v1TerminalCache.getOrCreate(paneId, {
			workspaceId,
			initialTheme: initialThemeRef.current,
			onFileLinkClick: (event, link) =>
				handleFileLinkClickRef.current(event, link),
			onUrlClickRef: handleUrlClickRef,
		});

		const { xterm, fitAddon, searchAddon } = cached;

		// Called after createOrAttach resolves: re-fit against the now-settled
		// container and push dims to the backend. Guards against stale sizes
		// from attachToContainer's fit running before flex layout resolved
		// (e.g. preset tabs, new workspace bulk creation). Mirrors v2's
		// terminal-ws-transport sendResize-on-open.
		const syncBackendDimensions = () => {
			if (container.clientWidth === 0 || container.clientHeight === 0) return;
			fitAddon.fit();
			resizeRef.current({ paneId, cols: xterm.cols, rows: xterm.rows });
		};

		// Attach the wrapper div to the live container.
		// The cache creates a ResizeObserver that calls fitAddon.fit() and
		// forwards resize events to the backend — no separate resize handler needed.
		const prevCols = xterm.cols;
		const prevRows = xterm.rows;
		v1TerminalCache.attachToContainer(paneId, container, () => {
			resizeRef.current({ paneId, cols: xterm.cols, rows: xterm.rows });
		});
		// If dimensions changed during attach (container resized while hidden),
		// notify the backend PTY immediately — the ResizeObserver only fires on
		// subsequent changes, not the initial fit.
		if (xterm.cols !== prevCols || xterm.rows !== prevRows) {
			resizeRef.current({ paneId, cols: xterm.cols, rows: xterm.rows });
		}

		const scheduleScrollToBottom = () => {
			requestAnimationFrame(() => {
				if (isUnmounted || xtermRef.current !== xterm) return;
				scrollToBottom(xterm);
			});
		};

		xtermRef.current = xterm;
		fitAddonRef.current = fitAddon;
		searchAddonRef.current = searchAddon;
		isExitedRef.current = false;
		setXtermInstance(xterm);
		isStreamReadyRef.current = false;
		pendingInitialStateRef.current = null;

		if (isFocusedRef.current) {
			xterm.focus();
		}

		// Wait for first render before applying restoration.
		// On reattach, xterm is already rendered so skip the render gate.
		let renderDisposable: IDisposable | null = null;
		let firstRenderFallback: ReturnType<typeof setTimeout> | null = null;

		if (isReattach) {
			didFirstRenderRef.current = true;
		} else {
			didFirstRenderRef.current = false;

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
		}

		const nextAttachRequestId = () => createAttachRequestId(paneId);
		const cancelAttachRequest = (requestId: string | null) => {
			if (!requestId) return;
			cancelCreateOrAttachRef.current({ paneId, requestId });
		};
		const writeWorkspaceRunCommand = async (command: string) => {
			await writeCommandInPane({
				paneId,
				command,
				write: (input) => electronTrpcClient.terminal.write.mutate(input),
			});
		};

		const restartTerminalSession = (options?: {
			command?: string;
			forceRestart?: boolean;
		}) =>
			new Promise<void>((resolve, reject) => {
				const command = options?.command ?? defaultRestartCommandRef.current;
				const workspaceRun = getPaneWorkspaceRun(paneId);
				if (workspaceRun && command) {
					setPaneWorkspaceRunState(paneId, "running");
				}
				const canReuseAttachedSession =
					Boolean(command) &&
					!options?.forceRestart &&
					!isExitedRef.current &&
					!connectionErrorRef.current;
				if (canReuseAttachedSession && command) {
					void writeWorkspaceRunCommand(command).then(resolve).catch(reject);
					return;
				}
				isExitedRef.current = false;
				isStreamReadyRef.current = false;
				wasKilledByUserRef.current = false;
				setExitStatus(null);
				resetModes();
				xterm.clear();
				const attach = () => {
					const requestId = nextAttachRequestId();
					cancelAttachRequest(activeAttachRequestId);
					activeAttachRequestId = requestId;
					clearTerminalSessionReady(paneId);
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
						},
						{
							onSuccess: (result) => {
								if (activeAttachRequestId !== requestId) {
									resolve();
									return;
								}
								setConnectionError(null);
								syncBackendDimensions();
								pendingInitialStateRef.current = result;
								maybeApplyInitialState();
								if (!command) {
									resolve();
									return;
								}
								void writeWorkspaceRunCommand(command)
									.then(resolve)
									.catch((error) => {
										console.error(
											"[Terminal] Failed to write workspace run command:",
											error,
										);
										if (workspaceRun) {
											setPaneWorkspaceRunState(paneId, "stopped-by-exit");
										}
										setConnectionError(
											error instanceof Error
												? error.message
												: "Failed to write workspace run command",
										);
										isStreamReadyRef.current = true;
										flushPendingEvents();
										reject(error);
									});
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

		const {
			workspaceRun: paneWorkspaceRun,
			isNewWorkspaceRun,
			restartCommand: workspaceRunRestartCommand,
		} = resolveWorkspaceRunAttachMode(paneId, defaultRestartCommandRef.current);

		// On reattach: stream is already running and xterm buffer is current.
		// Skip the entire createOrAttach + stream setup.
		let cancelInitialAttach: (() => void) | null = null;

		if (isReattach) {
			// Stream is ready — the cache has been writing data to xterm.
			// Resize is handled by attachToContainer's ResizeObserver above.
			isStreamReadyRef.current = true;
		} else {
			cancelInitialAttach = scheduleTerminalAttach({
				paneId,
				priority: isFocusedRef.current ? 0 : 1,
				run: (done) => {
					const startAttach = (commandToRunAfterAttach?: string) => {
						if (attachCanceled) return;
						if (attachInFlightByPane.has(paneId)) {
							cancelAttachWait = waitForAttachClear(paneId, () => {
								if (attachCanceled || isUnmounted) return;
								startAttach(commandToRunAfterAttach);
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
						clearTerminalSessionReady(paneId);

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
								...((isNewWorkspaceRun || Boolean(commandToRunAfterAttach)) && {
									skipColdRestore: true,
								}),
							},
							{
								onSuccess: (result) => {
									if (!isAttachActive()) return;
									if (activeAttachRequestId !== requestId) return;
									setConnectionError(null);
									clearPaneInitialDataRef.current(paneId);

									// Start the cache-owned stream subscription now that the
									// backend session exists, and mark it ready so events
									// flow through the component's registered handler.
									v1TerminalCache.startStream(paneId);
									v1TerminalCache.setStreamReady(paneId);
									markTerminalSessionReady(paneId);
									syncBackendDimensions();

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

									if (!commandToRunAfterAttach) {
										return;
									}

									void writeWorkspaceRunCommand(commandToRunAfterAttach).catch(
										(error) => {
											console.error(
												"[Terminal] Failed to write workspace run command after attach:",
												error,
											);
											if (paneWorkspaceRun) {
												setPaneWorkspaceRunState(paneId, "stopped-by-exit");
											}
											setConnectionError(
												error instanceof Error
													? error.message
													: "Failed to write workspace run command",
											);
											isStreamReadyRef.current = true;
											flushPendingEvents();
										},
									);
								},
								onError: (error) => {
									if (!isAttachActive()) return;
									if (activeAttachRequestId !== requestId) return;
									if (isTerminalAttachCanceledMessage(error.message)) {
										return;
									}
									const workspaceRun = getPaneWorkspaceRun(paneId);
									if (error.message?.includes("TERMINAL_SESSION_KILLED")) {
										rejectTerminalSessionReady(
											paneId,
											new Error(error.message || "Terminal session killed"),
										);
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
									rejectTerminalSessionReady(
										paneId,
										new Error(error.message || "Failed to connect to terminal"),
									);
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
							restartCommand: workspaceRunRestartCommand,
						});
						return;
					}

					startAttach();
					return;
				},
			});
		} // end if (!isReattach)

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
		const cleanupCopy = setupCopyHandler(xterm);

		const isPaneDestroyedInStore = () =>
			isPaneDestroyed(useTabsStore.getState().panes, paneId);

		return () => {
			const paneDestroyed = isPaneDestroyedInStore();
			if (DEBUG_TERMINAL) {
				console.log(
					`[Terminal] Unmount: ${paneId}, paneDestroyed=${paneDestroyed}`,
				);
			}
			cancelInitialAttach?.();
			isUnmounted = true;
			attachCanceled = true;
			cancelAttachRequest(activeAttachRequestId);
			activeAttachRequestId = null;
			const cleanupAttachId = activeAttachId || undefined;
			activeAttachId = 0;
			if (cancelAttachWait) {
				cancelAttachWait();
				cancelAttachWait = null;
			}
			clearAttachInFlight(paneId, cleanupAttachId);
			if (firstRenderFallback) clearTimeout(firstRenderFallback);
			inputDisposable.dispose();
			keyDisposable.dispose();
			titleDisposable.dispose();
			cleanupKeyboard();
			cleanupClickToMove();
			cleanupFocus?.();
			cleanupCopy();
			unregisterClearCallbackRef.current(paneId);
			unregisterScrollToBottomCallbackRef.current(paneId);
			unregisterGetSelectionCallbackRef.current(paneId);
			unregisterPasteCallbackRef.current(paneId);

			if (paneDestroyed) {
				// Pane was explicitly destroyed — full cleanup.
				killTerminalForPane(paneId);
				coldRestoreState.delete(paneId);
				pendingDetaches.delete(paneId);
				v1TerminalCache.dispose(paneId);
			} else {
				// Pane hidden (tab switch) — detach wrapper from DOM but keep
				// xterm AND stream subscription alive in the cache.
				// No backend detach — the session stays connected so data
				// continues flowing to xterm while hidden.
				v1TerminalCache.detachFromContainer(paneId);
			}

			pendingInitialStateRef.current = null;
			resetModes();
			renderDisposable?.dispose();

			// Do NOT dispose xterm or reset stream state — the cache owns
			// both the xterm lifecycle and the stream subscription.

			xtermRef.current = null;
			searchAddonRef.current = null;
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
