import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { IDisposable, ITheme, Terminal as XTerm } from "@xterm/xterm";
import type { MutableRefObject, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	clearTerminalKilledByUser,
	isTerminalKilledByUser,
} from "renderer/lib/terminal-kill-tracking";
import { useTabsStore } from "renderer/stores/tabs/store";
import { scheduleTerminalAttach } from "../attach-scheduler";
import { sanitizeForTitle } from "../commandBuffer";
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
import { coldRestoreState, pendingDetaches } from "../state";
import type {
	CreateOrAttachMutate,
	CreateOrAttachResult,
	TerminalClearScrollbackMutate,
	TerminalDetachMutate,
	TerminalResizeMutate,
	TerminalWriteMutate,
} from "../types";
import { scrollToBottom } from "../utils";

type DebouncedTitleSetter = ((tabId: string, title: string) => void) & {
	cancel?: () => void;
};

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
	paneInitialCommandsRef: MutableRefObject<string[] | undefined>;
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
	clearScrollbackRef: MutableRefObject<TerminalClearScrollbackMutate>;
	isStreamReadyRef: MutableRefObject<boolean>;
	didFirstRenderRef: MutableRefObject<boolean>;
	pendingInitialStateRef: MutableRefObject<CreateOrAttachResult | null>;
	maybeApplyInitialState: () => void;
	flushPendingEvents: () => void;
	resetModes: () => void;
	isAlternateScreenRef: MutableRefObject<boolean>;
	isBracketedPasteRef: MutableRefObject<boolean>;
	debouncedSetTabAutoTitleRef: MutableRefObject<DebouncedTitleSetter>;
	handleTerminalFocusRef: MutableRefObject<() => void>;
	registerClearCallbackRef: MutableRefObject<RegisterCallback>;
	unregisterClearCallbackRef: MutableRefObject<UnregisterCallback>;
	registerScrollToBottomCallbackRef: MutableRefObject<RegisterCallback>;
	unregisterScrollToBottomCallbackRef: MutableRefObject<UnregisterCallback>;
}

export interface UseTerminalLifecycleReturn {
	xtermInstance: XTerm | null;
	restartTerminal: () => void;
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
	paneInitialCommandsRef,
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
	clearScrollbackRef,
	isStreamReadyRef,
	didFirstRenderRef,
	pendingInitialStateRef,
	maybeApplyInitialState,
	flushPendingEvents,
	resetModes,
	isAlternateScreenRef,
	isBracketedPasteRef,
	debouncedSetTabAutoTitleRef,
	handleTerminalFocusRef,
	registerClearCallbackRef,
	unregisterClearCallbackRef,
	registerScrollToBottomCallbackRef,
	unregisterScrollToBottomCallbackRef,
}: UseTerminalLifecycleOptions): UseTerminalLifecycleReturn {
	const [xtermInstance, setXtermInstance] = useState<XTerm | null>(null);
	const restartTerminalRef = useRef<() => void>(() => {});
	const restartTerminal = useCallback(() => restartTerminalRef.current(), []);

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

		const restartTerminalSession = () => {
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
						debouncedSetTabAutoTitleRef.current(tabIdRef.current, title);
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

					if (isTerminalKilledByUser(paneId)) {
						wasKilledByUserRef.current = true;
						isExitedRef.current = true;
						isStreamReadyRef.current = false;
						setExitStatus("killed");
						finishAttach();
						return;
					}
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
							initialCommands,
							cwd: initialCwd,
						},
						{
							onSuccess: (result) => {
								if (!isAttachActive()) return;
								setConnectionError(null);
								if (initialCommands || initialCwd) {
									clearPaneInitialDataRef.current(paneId);
								}

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
				debouncedSetTabAutoTitleRef.current(tabIdRef.current, title);
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
		const cleanupCopy = setupCopyHandler(xterm);

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
			attachCanceled = true;
			const cleanupAttachId = activeAttachId || undefined;
			activeAttachId = 0;
			if (cancelAttachWait) {
				cancelAttachWait();
				cancelAttachWait = null;
			}
			clearAttachInFlight(paneId, cleanupAttachId);
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
			cleanupCopy();
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
	]);

	return { xtermInstance, restartTerminal };
}
