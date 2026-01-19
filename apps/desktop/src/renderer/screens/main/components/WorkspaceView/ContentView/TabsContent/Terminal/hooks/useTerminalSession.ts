import type { IDisposable, Terminal as XTerm } from "@xterm/xterm";
import { useCallback, useRef, useState } from "react";
import { clearTerminalKilledByUser } from "renderer/lib/terminal-kill-tracking";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import { parseModesWithCarryBuffer } from "../terminalModes";
import type { TerminalStreamEvent } from "../types";

// Debug logging for terminal lifecycle (enable via localStorage)
// Run in DevTools console: localStorage.setItem('SUPERSET_TERMINAL_DEBUG', '1')
const DEBUG_TERMINAL =
	typeof localStorage !== "undefined" &&
	localStorage.getItem("SUPERSET_TERMINAL_DEBUG") === "1";

const FIRST_RENDER_RESTORE_FALLBACK_MS = 250;

// Module-level map to track pending detach timeouts.
// This survives React StrictMode's unmount/remount cycle, allowing us to
// cancel a pending detach if the component immediately remounts.
export const pendingDetaches = new Map<string, NodeJS.Timeout>();

// Module-level map to track cold restore state across StrictMode cycles.
// When cold restore is detected, we store the state here so it survives
// the unmount/remount that StrictMode causes. Without this, the first mount
// detects cold restore and sets state, but StrictMode unmounts and remounts
// with fresh state, losing the cold restore detection.
export const coldRestoreState = new Map<
	string,
	{ isRestored: boolean; cwd: string | null; scrollback: string }
>();

export type CreateOrAttachResult = {
	wasRecovered: boolean;
	isNew: boolean;
	scrollback: string;
	viewportY?: number;
	// Cold restore fields (for reboot recovery)
	isColdRestore?: boolean;
	previousCwd?: string;
	snapshot?: {
		snapshotAnsi: string;
		rehydrateSequences: string;
		cwd: string | null;
		modes: Record<string, boolean>;
		cols: number;
		rows: number;
		scrollbackLines: number;
		debug?: {
			xtermBufferType: string;
			hasAltScreenEntry: boolean;
			altBuffer?: {
				lines: number;
				nonEmptyLines: number;
				totalChars: number;
				cursorX: number;
				cursorY: number;
				sampleLines: string[];
			};
			normalBufferLines: number;
		};
	};
};

export interface UseTerminalSessionOptions {
	paneId: string;
	onConnectionError: (error: string | null) => void;
	onExitStatusChange: (status: "killed" | "exited" | null) => void;
	onCwdUpdate: (data: string) => void;
}

export interface UseTerminalSessionRefs {
	xtermRef: React.RefObject<XTerm | null>;
	parentTabIdRef: React.RefObject<string | undefined>;
	isFocusedRef: React.RefObject<boolean>;
}

export interface UseTerminalSessionResult {
	// State
	isRestoredMode: boolean;
	restoredCwd: string | null;
	// Refs for internal state that doesn't trigger re-renders
	refs: {
		isStreamReady: React.RefObject<boolean>;
		didFirstRender: React.RefObject<boolean>;
		pendingInitialState: React.RefObject<CreateOrAttachResult | null>;
		pendingEvents: React.RefObject<TerminalStreamEvent[]>;
		restoreSequence: React.RefObject<number>;
		renderDisposable: React.RefObject<IDisposable | null>;
		isExited: React.RefObject<boolean>;
		wasKilledByUser: React.RefObject<boolean>;
		firstStreamDataReceived: React.RefObject<boolean>;
		// Mode tracking refs
		isAlternateScreen: React.RefObject<boolean>;
		isBracketedPaste: React.RefObject<boolean>;
		modeScanBuffer: React.RefObject<string>;
	};
	// Actions
	updateModesFromData: (data: string) => void;
	flushPendingEvents: () => void;
	maybeApplyInitialState: () => void;
	handleStartShell: (params: {
		createOrAttachRef: React.RefObject<
			(
				params: {
					paneId: string;
					tabId: string;
					workspaceId: string;
					cols: number;
					rows: number;
					cwd?: string;
					skipColdRestore?: boolean;
					allowKilled?: boolean;
				},
				callbacks: {
					onSuccess: (result: CreateOrAttachResult) => void;
					onError: (error: { message?: string }) => void;
				},
			) => void
		>;
		workspaceId: string;
		fitAddon: { fit: () => void } | null;
	}) => void;
	handleRetryConnection: (params: {
		createOrAttachRef: React.RefObject<
			(
				params: {
					paneId: string;
					tabId: string;
					workspaceId: string;
					cols: number;
					rows: number;
				},
				callbacks: {
					onSuccess: (result: CreateOrAttachResult) => void;
					onError: (error: { message?: string }) => void;
				},
			) => void
		>;
		workspaceId: string;
	}) => void;
	resetForNewSession: () => void;
	setupFirstRenderGating: (params: {
		xterm: XTerm;
		onFirstRender: () => void;
	}) => { cleanup: () => void; fallbackTimeout: NodeJS.Timeout };
	handleStreamData: (event: TerminalStreamEvent) => void;
}

/**
 * Hook to manage terminal session lifecycle, stream/restore gating, and mode tracking.
 *
 * Encapsulates:
 * - Session create/attach/retry/restart logic
 * - Pending event queue for pre-stream data
 * - Cold restore state management
 * - Render gating (wait for xterm first render before restoration)
 * - Alternate screen and bracketed paste mode tracking
 */
export function useTerminalSession(
	options: UseTerminalSessionOptions,
	sessionRefs: UseTerminalSessionRefs,
): UseTerminalSessionResult {
	const { paneId, onConnectionError, onExitStatusChange, onCwdUpdate } =
		options;
	const { xtermRef, parentTabIdRef, isFocusedRef } = sessionRefs;

	// Cold restore UI state
	const [isRestoredMode, setIsRestoredMode] = useState(false);
	const [restoredCwd, setRestoredCwd] = useState<string | null>(null);

	// Internal refs that don't trigger re-renders
	const isStreamReadyRef = useRef(false);
	const didFirstRenderRef = useRef(false);
	const pendingInitialStateRef = useRef<CreateOrAttachResult | null>(null);
	const pendingEventsRef = useRef<TerminalStreamEvent[]>([]);
	const restoreSequenceRef = useRef(0);
	const renderDisposableRef = useRef<IDisposable | null>(null);
	const isExitedRef = useRef(false);
	const wasKilledByUserRef = useRef(false);
	const firstStreamDataReceivedRef = useRef(false);

	// Mode tracking refs
	const isAlternateScreenRef = useRef(false);
	const isBracketedPasteRef = useRef(false);
	const modeScanBufferRef = useRef("");

	// Avoid effect re-runs: track restored mode via refs for input gating
	const isRestoredModeRef = useRef(isRestoredMode);
	isRestoredModeRef.current = isRestoredMode;

	const updateModesFromData = useCallback((data: string) => {
		const { modes, newCarryBuffer } = parseModesWithCarryBuffer(
			data,
			modeScanBufferRef.current,
			{
				alternateScreen: isAlternateScreenRef.current,
				bracketedPaste: isBracketedPasteRef.current,
			},
		);

		isAlternateScreenRef.current = modes.alternateScreen;
		isBracketedPasteRef.current = modes.bracketedPaste;
		modeScanBufferRef.current = newCarryBuffer;
	}, []);

	const handleTerminalExit = useCallback(
		(exitCode: number, xterm: XTerm, wasKilledByUser: boolean) => {
			isExitedRef.current = true;
			isStreamReadyRef.current = false;
			wasKilledByUserRef.current = wasKilledByUser;
			onExitStatusChange(wasKilledByUser ? "killed" : "exited");

			if (wasKilledByUser) {
				xterm.writeln("\r\n\r\n[Session killed]");
				xterm.writeln("[Restart to start a new session]");
			} else {
				xterm.writeln(`\r\n\r\n[Process exited with code ${exitCode}]`);
				xterm.writeln("[Press any key to restart]");
			}
		},
		[onExitStatusChange],
	);

	const flushPendingEvents = useCallback(() => {
		const xterm = xtermRef.current;
		if (!xterm) return;
		if (pendingEventsRef.current.length === 0) return;

		const events = pendingEventsRef.current.splice(
			0,
			pendingEventsRef.current.length,
		);

		for (const event of events) {
			if (event.type === "data") {
				updateModesFromData(event.data);
				xterm.write(event.data);
				onCwdUpdate(event.data);
			} else if (event.type === "exit") {
				const wasKilledByUser = wasKilledByUserRef.current;
				handleTerminalExit(event.exitCode, xterm, wasKilledByUser);
			} else if (event.type === "disconnect") {
				onConnectionError(event.reason || "Connection to terminal daemon lost");
			} else if (event.type === "error") {
				const message = event.code
					? `${event.code}: ${event.error}`
					: event.error;
				console.warn("[Terminal] stream error:", message);

				// "Session not found" means daemon restarted and lost our session
				if (
					event.code === "WRITE_FAILED" &&
					event.error?.includes("Session not found")
				) {
					onConnectionError("Session lost - click to reconnect");
					return;
				}

				// "PTY not spawned" is a transient race condition during recovery
				if (
					event.code === "WRITE_FAILED" &&
					event.error?.includes("PTY not spawned")
				) {
					xterm.writeln(`\r\n[Terminal] ${message}`);
					return;
				}

				if (
					event.code === "WRITE_QUEUE_FULL" ||
					event.code === "WRITE_FAILED"
				) {
					xterm.writeln(`\r\n[Terminal] ${message}`);
				} else {
					onConnectionError(message);
				}
			}
		}
	}, [
		xtermRef,
		updateModesFromData,
		onCwdUpdate,
		handleTerminalExit,
		onConnectionError,
	]);

	const maybeApplyInitialState = useCallback(() => {
		if (!didFirstRenderRef.current) return;
		const result = pendingInitialStateRef.current;
		if (!result) return;

		const xterm = xtermRef.current;
		if (!xterm) return;

		// Clear before applying to prevent double-apply on concurrent triggers
		pendingInitialStateRef.current = null;
		const _restoreSequence = ++restoreSequenceRef.current;

		try {
			// Canonical initial content: prefer snapshot (daemon mode) over scrollback
			const initialAnsi = result.snapshot?.snapshotAnsi ?? result.scrollback;

			// Track modes from snapshot
			isAlternateScreenRef.current = !!result.snapshot?.modes.alternateScreen;
			isBracketedPasteRef.current = !!result.snapshot?.modes.bracketedPaste;
			modeScanBufferRef.current = "";

			// Fallback: parse initialAnsi when snapshot.modes is unavailable
			if (initialAnsi && result.snapshot?.modes === undefined) {
				const modes = parseModesWithCarryBuffer(initialAnsi, "", {
					alternateScreen: false,
					bracketedPaste: false,
				});
				isAlternateScreenRef.current = modes.modes.alternateScreen;
				isBracketedPasteRef.current = modes.modes.bracketedPaste;
			}

			// Resize xterm to match snapshot dimensions before applying content
			const snapshotCols = result.snapshot?.cols;
			const snapshotRows = result.snapshot?.rows;
			if (
				snapshotCols &&
				snapshotRows &&
				(xterm.cols !== snapshotCols || xterm.rows !== snapshotRows)
			) {
				xterm.resize(snapshotCols, snapshotRows);
			}

			const isAltScreenReattach =
				!result.isNew && result.snapshot?.modes.alternateScreen;

			// For alt-screen (TUI) sessions, enter alt-screen and trigger SIGWINCH
			if (isAltScreenReattach) {
				xterm.write("\x1b[?1049h", () => {
					if (result.snapshot?.rehydrateSequences) {
						const ESC = "\x1b";
						const filteredRehydrate = result.snapshot.rehydrateSequences
							.split(`${ESC}[?1049h`)
							.join("")
							.split(`${ESC}[?47h`)
							.join("");
						if (filteredRehydrate) {
							xterm.write(filteredRehydrate);
						}
					}

					isStreamReadyRef.current = true;
					if (DEBUG_TERMINAL) {
						console.log(
							`[Terminal] isStreamReady=true (altScreen): ${paneId}, pendingEvents=${pendingEventsRef.current.length}`,
						);
					}
					flushPendingEvents();
				});

				if (result.snapshot?.cwd) {
					onCwdUpdate(result.snapshot.cwd);
				} else {
					onCwdUpdate(initialAnsi);
				}
				return;
			}

			const rehydrateSequences = result.snapshot?.rehydrateSequences ?? "";

			const finalizeRestore = () => {
				isStreamReadyRef.current = true;
				if (DEBUG_TERMINAL) {
					console.log(
						`[Terminal] isStreamReady=true (finalizeRestore): ${paneId}, pendingEvents=${pendingEventsRef.current.length}`,
					);
				}
				flushPendingEvents();
			};

			const writeSnapshot = () => {
				if (!initialAnsi) {
					finalizeRestore();
					return;
				}
				xterm.write(initialAnsi, finalizeRestore);
			};

			if (rehydrateSequences) {
				xterm.write(rehydrateSequences, writeSnapshot);
			} else {
				writeSnapshot();
			}

			if (result.snapshot?.cwd) {
				onCwdUpdate(result.snapshot.cwd);
			} else {
				onCwdUpdate(initialAnsi);
			}
		} catch (error) {
			console.error("[Terminal] Restoration failed:", error);
			isStreamReadyRef.current = true;
			flushPendingEvents();
		}
	}, [paneId, xtermRef, flushPendingEvents, onCwdUpdate]);

	const resetForNewSession = useCallback(() => {
		isExitedRef.current = false;
		isStreamReadyRef.current = false;
		wasKilledByUserRef.current = false;
		onExitStatusChange(null);
		clearTerminalKilledByUser(paneId);
		pendingInitialStateRef.current = null;
		isAlternateScreenRef.current = false;
		isBracketedPasteRef.current = false;
		modeScanBufferRef.current = "";
	}, [paneId, onExitStatusChange]);

	const handleStartShell = useCallback(
		(params: {
			createOrAttachRef: React.RefObject<
				(
					params: {
						paneId: string;
						tabId: string;
						workspaceId: string;
						cols: number;
						rows: number;
						cwd?: string;
						skipColdRestore?: boolean;
						allowKilled?: boolean;
					},
					callbacks: {
						onSuccess: (result: CreateOrAttachResult) => void;
						onError: (error: { message?: string }) => void;
					},
				) => void
			>;
			workspaceId: string;
			fitAddon: { fit: () => void } | null;
		}) => {
			const { createOrAttachRef, workspaceId, fitAddon } = params;
			const xterm = xtermRef.current;
			if (!xterm || !fitAddon) return;

			// Drop any queued events from pre-restore session
			pendingEventsRef.current = [];

			// Acknowledge cold restore to main process
			trpcClient.terminal.ackColdRestore.mutate({ paneId }).catch((error) => {
				console.warn("[Terminal] Failed to acknowledge cold restore:", {
					paneId,
					error: error instanceof Error ? error.message : String(error),
				});
			});

			// Add visual separator
			xterm.write("\r\n\x1b[90m─── New session ───\x1b[0m\r\n\r\n");

			resetForNewSession();

			createOrAttachRef.current(
				{
					paneId,
					tabId: parentTabIdRef.current || paneId,
					workspaceId,
					cols: xterm.cols,
					rows: xterm.rows,
					cwd: restoredCwd || undefined,
					skipColdRestore: true,
					allowKilled: true,
				},
				{
					onSuccess: (result) => {
						pendingInitialStateRef.current = result;
						maybeApplyInitialState();

						setIsRestoredMode(false);
						coldRestoreState.delete(paneId);

						setTimeout(() => {
							xtermRef.current?.focus();
						}, 0);
					},
					onError: (error) => {
						console.error("[Terminal] Failed to start shell:", error);
						onConnectionError(error.message || "Failed to start shell");
						setIsRestoredMode(false);
						coldRestoreState.delete(paneId);
						isStreamReadyRef.current = true;
						flushPendingEvents();
					},
				},
			);
		},
		[
			paneId,
			xtermRef,
			parentTabIdRef,
			restoredCwd,
			resetForNewSession,
			maybeApplyInitialState,
			flushPendingEvents,
			onConnectionError,
		],
	);

	const handleRetryConnection = useCallback(
		(params: {
			createOrAttachRef: React.RefObject<
				(
					params: {
						paneId: string;
						tabId: string;
						workspaceId: string;
						cols: number;
						rows: number;
					},
					callbacks: {
						onSuccess: (result: CreateOrAttachResult) => void;
						onError: (error: { message?: string }) => void;
					},
				) => void
			>;
			workspaceId: string;
		}) => {
			const { createOrAttachRef, workspaceId } = params;
			onConnectionError(null);
			const xterm = xtermRef.current;
			if (!xterm) return;

			isStreamReadyRef.current = false;
			pendingInitialStateRef.current = null;

			xterm.clear();
			xterm.writeln("Retrying connection...\r\n");

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
						const currentXterm = xtermRef.current;
						if (!currentXterm) return;

						onConnectionError(null);

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

							currentXterm.clear();
							if (scrollback) {
								currentXterm.write(scrollback);
							}

							didFirstRenderRef.current = true;
							return;
						}

						pendingInitialStateRef.current = result;
						maybeApplyInitialState();

						if (isFocusedRef.current) {
							currentXterm.focus();
						}
					},
					onError: (error) => {
						if (error.message?.includes("TERMINAL_SESSION_KILLED")) {
							wasKilledByUserRef.current = true;
							isExitedRef.current = true;
							isStreamReadyRef.current = false;
							onExitStatusChange("killed");
							onConnectionError(null);
							return;
						}
						onConnectionError(error.message || "Connection failed");
						isStreamReadyRef.current = true;
						flushPendingEvents();
					},
				},
			);
		},
		[
			paneId,
			xtermRef,
			parentTabIdRef,
			isFocusedRef,
			maybeApplyInitialState,
			flushPendingEvents,
			onConnectionError,
			onExitStatusChange,
		],
	);

	const setupFirstRenderGating = useCallback(
		(params: { xterm: XTerm; onFirstRender: () => void }) => {
			const { xterm, onFirstRender } = params;

			renderDisposableRef.current?.dispose();
			let fallbackTimeout: NodeJS.Timeout | null = null;

			renderDisposableRef.current = xterm.onRender(() => {
				if (fallbackTimeout) {
					clearTimeout(fallbackTimeout);
					fallbackTimeout = null;
				}
				renderDisposableRef.current?.dispose();
				renderDisposableRef.current = null;
				didFirstRenderRef.current = true;
				onFirstRender();
			});

			fallbackTimeout = setTimeout(() => {
				if (didFirstRenderRef.current) return;
				didFirstRenderRef.current = true;
				onFirstRender();
			}, FIRST_RENDER_RESTORE_FALLBACK_MS);

			return {
				cleanup: () => {
					if (fallbackTimeout) {
						clearTimeout(fallbackTimeout);
					}
					renderDisposableRef.current?.dispose();
					renderDisposableRef.current = null;
				},
				fallbackTimeout,
			};
		},
		[],
	);

	const handleStreamData = useCallback(
		(event: TerminalStreamEvent) => {
			// Queue events until terminal is ready
			if (!xtermRef.current || !isStreamReadyRef.current) {
				if (DEBUG_TERMINAL && event.type === "data") {
					console.log(
						`[Terminal] Queuing event (not ready): ${paneId}, type=${event.type}, bytes=${event.data.length}, isStreamReady=${isStreamReadyRef.current}`,
					);
				}
				pendingEventsRef.current.push(event);
				return;
			}

			if (event.type === "data") {
				if (DEBUG_TERMINAL && !firstStreamDataReceivedRef.current) {
					firstStreamDataReceivedRef.current = true;
					console.log(
						`[Terminal] First stream data received: ${paneId}, ${event.data.length} bytes`,
					);
				}
				updateModesFromData(event.data);
				xtermRef.current.write(event.data);
				onCwdUpdate(event.data);
			} else if (event.type === "exit") {
				const xterm = xtermRef.current;
				if (xterm) {
					handleTerminalExit(event.exitCode, xterm, wasKilledByUserRef.current);
				}
			} else if (event.type === "disconnect") {
				onConnectionError(event.reason || "Connection to terminal daemon lost");
			} else if (event.type === "error") {
				const message = event.code
					? `${event.code}: ${event.error}`
					: event.error;
				console.warn("[Terminal] stream error:", message);

				if (
					event.code === "WRITE_FAILED" &&
					event.error?.includes("Session not found")
				) {
					onConnectionError("Session lost - click to reconnect");
					return;
				}

				if (
					event.code === "WRITE_FAILED" &&
					event.error?.includes("PTY not spawned")
				) {
					xtermRef.current?.writeln(`\r\n[Terminal] ${message}`);
					return;
				}

				if (
					event.code === "WRITE_QUEUE_FULL" ||
					event.code === "WRITE_FAILED"
				) {
					xtermRef.current?.writeln(`\r\n[Terminal] ${message}`);
				} else {
					onConnectionError(message);
				}
			}
		},
		[
			paneId,
			xtermRef,
			updateModesFromData,
			onCwdUpdate,
			handleTerminalExit,
			onConnectionError,
		],
	);

	return {
		isRestoredMode,
		restoredCwd,
		refs: {
			isStreamReady: isStreamReadyRef,
			didFirstRender: didFirstRenderRef,
			pendingInitialState: pendingInitialStateRef,
			pendingEvents: pendingEventsRef,
			restoreSequence: restoreSequenceRef,
			renderDisposable: renderDisposableRef,
			isExited: isExitedRef,
			wasKilledByUser: wasKilledByUserRef,
			firstStreamDataReceived: firstStreamDataReceivedRef,
			isAlternateScreen: isAlternateScreenRef,
			isBracketedPaste: isBracketedPasteRef,
			modeScanBuffer: modeScanBufferRef,
		},
		updateModesFromData,
		flushPendingEvents,
		maybeApplyInitialState,
		handleStartShell,
		handleRetryConnection,
		resetForNewSession,
		setupFirstRenderGating,
		handleStreamData,
	};
}
