import type { ITheme, Terminal as XTerm } from "@xterm/xterm";
import type { FitAddon } from "ghostty-web";
import type { MutableRefObject, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import { killTerminalForPane } from "renderer/stores/tabs/utils/terminal-cleanup";
import { scheduleTerminalAttach } from "../attach-scheduler";
import { sanitizeForTitle } from "../commandBuffer";
import { DEBUG_TERMINAL } from "../config";
import { blurTerminalInput, focusTerminalInput } from "../ghostty-adapter";
import {
	createTerminalInstance,
	setupClickToMoveCursor,
	setupCopyHandler,
	setupFocusListener,
	setupKeyboardHandler,
	setupPasteHandler,
	setupResizeHandlers,
} from "../helpers";
import { isPaneDestroyed } from "../pane-guards";
import { coldRestoreState, pendingDetaches } from "../state";
import type { TerminalSearchAdapter } from "../TerminalSearch/terminal-search-adapter";
import { createTerminalSearchAdapter } from "../TerminalSearch/terminal-search-adapter";
import type {
	CreateOrAttachMutate,
	CreateOrAttachResult,
	TerminalClearScrollbackMutate,
	TerminalDetachMutate,
	TerminalResizeMutateAsync,
	TerminalWriteMutate,
} from "../types";
import { isTerminalAtBottom, scrollToBottom } from "../utils";

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
	isRendererReady: boolean;
	paneId: string;
	tabIdRef: MutableRefObject<string>;
	workspaceId: string;
	terminalRef: RefObject<HTMLDivElement | null>;
	xtermRef: MutableRefObject<XTerm | null>;
	fitAddonRef: MutableRefObject<FitAddon | null>;
	searchAddonRef: MutableRefObject<TerminalSearchAdapter | null>;
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
	resizeAsyncRef: MutableRefObject<TerminalResizeMutateAsync>;
	detachRef: MutableRefObject<TerminalDetachMutate>;
	clearScrollbackRef: MutableRefObject<TerminalClearScrollbackMutate>;
	activeSessionGenerationRef: MutableRefObject<string | null>;
	isStreamReadyRef: MutableRefObject<boolean>;
	pendingInitialStateRef: MutableRefObject<CreateOrAttachResult | null>;
	maybeApplyInitialState: () => void;
	flushPendingEvents: () => void;
	resetModes: () => void;
	onViewPending?: () => void;
	onViewReady?: () => void;
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
}

export interface UseTerminalLifecycleReturn {
	xtermInstance: XTerm | null;
	restartTerminal: () => void;
}

export function useTerminalLifecycle({
	isRendererReady,
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
	resizeAsyncRef,
	detachRef,
	clearScrollbackRef,
	activeSessionGenerationRef,
	isStreamReadyRef,
	pendingInitialStateRef,
	maybeApplyInitialState,
	flushPendingEvents,
	resetModes,
	onViewPending,
	onViewReady,
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
}: UseTerminalLifecycleOptions): UseTerminalLifecycleReturn {
	const [xtermInstance, setXtermInstance] = useState<XTerm | null>(null);
	const restartTerminalRef = useRef<() => void>(() => {});
	const restartTerminal = useCallback(() => restartTerminalRef.current(), []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refs used intentionally
	useEffect(() => {
		if (!isRendererReady) return;
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
		let cancelAttachWait: (() => void) | null = null;

		const { xterm, fitAddon } = createTerminalInstance(container, {
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
		isExitedRef.current = false;
		setXtermInstance(xterm);
		onViewPending?.();
		isStreamReadyRef.current = false;
		activeSessionGenerationRef.current = null;
		pendingInitialStateRef.current = null;

		if (isFocusedRef.current) {
			focusTerminalInput(xterm);
		} else {
			// ghostty-web focuses during open(); counter that for background panes.
			blurTerminalInput(xterm);
			setTimeout(() => {
				if (isUnmounted || xtermRef.current !== xterm) return;
				blurTerminalInput(xterm);
			}, 0);
		}

		if (!isUnmounted) {
			searchAddonRef.current = createTerminalSearchAdapter(xterm);
		}

		const restartTerminalSession = () => {
			onViewPending?.();
			isExitedRef.current = false;
			isStreamReadyRef.current = false;
			activeSessionGenerationRef.current = null;
			wasKilledByUserRef.current = false;
			setExitStatus(null);
			resetModes();
			xterm.clear();
			createOrAttachRef.current(
				{
					paneId,
					tabId: tabIdRef.current,
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

		restartTerminalRef.current = restartTerminalSession;

		const handleTerminalInput = (data: string) => {
			if (isRestoredModeRef.current || connectionErrorRef.current) return;
			if (isExitedRef.current) {
				if (!isFocusedRef.current || wasKilledByUserRef.current) return;
				restartTerminalSession();
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
					if (title) {
						setPaneNameRef.current(paneId, title);
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
							tabId: tabIdRef.current,
							workspaceId,
							cols: xterm.cols,
							rows: xterm.rows,
							cwd: initialCwd,
						},
						{
							onSuccess: (result) => {
								if (!isAttachActive()) return;
								setConnectionError(null);
								clearPaneInitialDataRef.current(paneId);

								const storedColdRestore = coldRestoreState.get(paneId);
								if (storedColdRestore?.isRestored) {
									activeSessionGenerationRef.current = null;
									setIsRestoredMode(true);
									setRestoredCwd(storedColdRestore.cwd);
									if (storedColdRestore.scrollback && xterm) {
										xterm.write(storedColdRestore.scrollback, () => {
											scheduleScrollToBottom();
											onViewReady?.();
										});
									} else {
										onViewReady?.();
									}
									return;
								}

								if (result.isColdRestore) {
									activeSessionGenerationRef.current = null;
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
										xterm.write(scrollback, () => {
											scheduleScrollToBottom();
											onViewReady?.();
										});
									} else {
										onViewReady?.();
									}
									return;
								}

								pendingInitialStateRef.current = result;
								maybeApplyInitialState();
							},
							onError: (error) => {
								if (!isAttachActive()) return;
								if (error.message?.includes("TERMINAL_SESSION_KILLED")) {
									wasKilledByUserRef.current = true;
									isExitedRef.current = true;
									isStreamReadyRef.current = false;
									activeSessionGenerationRef.current = null;
									setExitStatus("killed");
									setConnectionError(null);
									onViewReady?.();
									return;
								}
								console.error("[Terminal] Failed to create/attach:", error);
								setConnectionError(
									error.message || "Failed to connect to terminal",
								);
								activeSessionGenerationRef.current = null;
								isStreamReadyRef.current = true;
								flushPendingEvents();
								onViewReady?.();
							},
							onSettled: () => finishAttach(),
						},
					);
				};

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
			onClear: handleClear,
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

		let resizeInFlight = false;
		let pendingResize = false;
		let resizeRafId: number | null = null;
		let resizeWasAtBottom = false;
		let resizeForce = false;
		let lastRequestedCols = 0;
		let lastRequestedRows = 0;

		const schedulePtyFirstResize = (options?: {
			force?: boolean;
			wasAtBottom?: boolean;
		}) => {
			if (isUnmounted || xtermRef.current !== xterm) return;

			resizeForce ||= options?.force ?? false;
			resizeWasAtBottom ||= options?.wasAtBottom ?? false;

			if (resizeInFlight) {
				pendingResize = true;
				return;
			}

			resizeInFlight = true;
			if (resizeRafId !== null) {
				cancelAnimationFrame(resizeRafId);
			}

			resizeRafId = requestAnimationFrame(() => {
				resizeRafId = null;

				const runResize = async () => {
					const shouldForce = resizeForce;
					const shouldStickBottom = resizeWasAtBottom;
					resizeForce = false;
					resizeWasAtBottom = false;

					const proposed = fitAddon.proposeDimensions();
					if (!proposed) return;

					const { cols, rows } = proposed;
					if (
						!shouldForce &&
						cols === lastRequestedCols &&
						rows === lastRequestedRows
					) {
						return;
					}

					lastRequestedCols = cols;
					lastRequestedRows = rows;

					try {
						await resizeAsyncRef.current({ paneId, cols, rows });
					} catch (error) {
						lastRequestedCols = 0;
						lastRequestedRows = 0;
						console.warn("[Terminal] Failed to resize PTY:", error);
						return;
					}

					if (isUnmounted || xtermRef.current !== xterm) return;
					xterm.resize(cols, rows);

					if (!shouldStickBottom) return;
					requestAnimationFrame(() => {
						if (isUnmounted || xtermRef.current !== xterm) return;
						scrollToBottom(xterm);
					});
				};

				void runResize().finally(() => {
					resizeInFlight = false;
					if (!pendingResize) return;
					pendingResize = false;
					schedulePtyFirstResize();
				});
			});
		};

		const cleanupFocus = setupFocusListener(xterm, () =>
			handleTerminalFocusRef.current(),
		);
		const cleanupResize = setupResizeHandlers(
			container,
			xterm,
			(wasAtBottom) => {
				schedulePtyFirstResize({ wasAtBottom });
			},
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

			const wasAtBottom = isTerminalAtBottom(xterm);
			schedulePtyFirstResize({ force: forceResize, wasAtBottom });

			if (isFocusedRef.current && document.hasFocus()) {
				focusTerminalInput(xterm);
			}
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
			cancelInitialAttach();
			isUnmounted = true;
			attachCanceled = true;
			const cleanupAttachId = activeAttachId || undefined;
			activeAttachId = 0;
			if (cancelAttachWait) {
				cancelAttachWait();
				cancelAttachWait = null;
			}
			clearAttachInFlight(paneId, cleanupAttachId);
			cancelReattachRecovery();
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("focus", handleWindowFocus);
			inputDisposable.dispose();
			keyDisposable.dispose();
			titleDisposable.dispose();
			if (resizeRafId !== null) {
				cancelAnimationFrame(resizeRafId);
				resizeRafId = null;
			}
			cleanupKeyboard();
			cleanupClickToMove();
			cleanupFocus?.();
			cleanupResize();
			cleanupPaste();
			cleanupCopy();
			unregisterClearCallbackRef.current(paneId);
			unregisterScrollToBottomCallbackRef.current(paneId);
			unregisterGetSelectionCallbackRef.current(paneId);
			unregisterPasteCallbackRef.current(paneId);

			if (isPaneDestroyedInStore()) {
				// Pane was explicitly destroyed, so kill the session.
				killTerminalForPane(paneId);
				coldRestoreState.delete(paneId);
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
			activeSessionGenerationRef.current = null;
			pendingInitialStateRef.current = null;
			resetModes();

			xterm.dispose();
			container.replaceChildren();

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
		activeSessionGenerationRef,
		onViewPending,
		onViewReady,
		setIsRestoredMode,
		setRestoredCwd,
		isRendererReady,
	]);

	return { xtermInstance, restartTerminal };
}
