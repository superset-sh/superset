import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useCallback, useRef } from "react";
import { DEBUG_TERMINAL } from "../config";
import type { CreateOrAttachResult, TerminalStreamEvent } from "../types";
import { scrollToBottom } from "../utils";

export interface UseTerminalRestoreOptions {
	paneId: string;
	xtermRef: React.MutableRefObject<XTerm | null>;
	fitAddonRef: React.MutableRefObject<FitAddon | null>;
	pendingEventsRef: React.MutableRefObject<TerminalStreamEvent[]>;
	isAlternateScreenRef: React.MutableRefObject<boolean>;
	isBracketedPasteRef: React.MutableRefObject<boolean>;
	modeScanBufferRef: React.MutableRefObject<string>;
	updateCwdFromData: (data: string) => void;
	updateModesFromData: (data: string) => void;
	onExitEvent: (exitCode: number, xterm: XTerm) => void;
	onErrorEvent: (
		event: Extract<TerminalStreamEvent, { type: "error" }>,
		xterm: XTerm,
	) => void;
	onDisconnectEvent: (reason: string | undefined) => void;
}

export interface UseTerminalRestoreReturn {
	isStreamReadyRef: React.MutableRefObject<boolean>;
	didFirstRenderRef: React.MutableRefObject<boolean>;
	pendingInitialStateRef: React.MutableRefObject<CreateOrAttachResult | null>;
	restoreSequenceRef: React.MutableRefObject<number>;
	maybeApplyInitialState: () => void;
	flushPendingEvents: () => void;
}

/**
 * Hook to manage terminal state restoration from snapshots.
 *
 * Handles:
 * - Applying initial state from createOrAttach response
 * - Restoring terminal modes (alternate screen, bracketed paste)
 * - Managing stream readiness gating
 * - Flushing pending events after restoration
 */
export function useTerminalRestore({
	paneId,
	xtermRef,
	fitAddonRef,
	pendingEventsRef,
	isAlternateScreenRef,
	isBracketedPasteRef,
	modeScanBufferRef,
	updateCwdFromData,
	updateModesFromData,
	onExitEvent,
	onErrorEvent,
	onDisconnectEvent,
}: UseTerminalRestoreOptions): UseTerminalRestoreReturn {
	// Gate streaming until initial state restoration is applied
	const isStreamReadyRef = useRef(false);
	// Gate restoration until xterm has rendered at least once
	const didFirstRenderRef = useRef(false);
	const pendingInitialStateRef = useRef<CreateOrAttachResult | null>(null);
	const restoreSequenceRef = useRef(0);

	// Refs to use latest values in callbacks
	const updateCwdRef = useRef(updateCwdFromData);
	updateCwdRef.current = updateCwdFromData;
	const updateModesRef = useRef(updateModesFromData);
	updateModesRef.current = updateModesFromData;
	const onExitEventRef = useRef(onExitEvent);
	onExitEventRef.current = onExitEvent;
	const onErrorEventRef = useRef(onErrorEvent);
	onErrorEventRef.current = onErrorEvent;
	const onDisconnectEventRef = useRef(onDisconnectEvent);
	onDisconnectEventRef.current = onDisconnectEvent;

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
				updateModesRef.current(event.data);
				xterm.write(event.data);
				updateCwdRef.current(event.data);
			} else if (event.type === "exit") {
				onExitEventRef.current(event.exitCode, xterm);
			} else if (event.type === "error") {
				onErrorEventRef.current(event, xterm);
			} else if (event.type === "disconnect") {
				onDisconnectEventRef.current(event.reason);
			}
		}
	}, [xtermRef, pendingEventsRef]);

	const maybeApplyInitialState = useCallback(() => {
		if (!didFirstRenderRef.current) return;
		const result = pendingInitialStateRef.current;
		if (!result) return;

		const xterm = xtermRef.current;
		const fitAddon = fitAddonRef.current;
		if (!xterm || !fitAddon) return;

		// Clear before applying to prevent double-apply on concurrent triggers
		pendingInitialStateRef.current = null;
		++restoreSequenceRef.current;
		const restoreSequence = restoreSequenceRef.current;

		try {
			const scheduleFitAndScroll = () => {
				requestAnimationFrame(() => {
					if (xtermRef.current !== xterm) return;
					if (restoreSequenceRef.current !== restoreSequence) return;
					fitAddon.fit();
					scrollToBottom(xterm);
				});
			};

			// Canonical initial content: prefer snapshot (daemon mode) over scrollback
			const initialAnsi = result.snapshot?.snapshotAnsi ?? result.scrollback;

			// Track alternate screen mode from snapshot
			isAlternateScreenRef.current = !!result.snapshot?.modes.alternateScreen;
			isBracketedPasteRef.current = !!result.snapshot?.modes.bracketedPaste;
			modeScanBufferRef.current = "";

			// Fallback: parse initialAnsi for escape sequences when snapshot.modes is unavailable
			if (initialAnsi && result.snapshot?.modes === undefined) {
				const enterAltIndex = Math.max(
					initialAnsi.lastIndexOf("\x1b[?1049h"),
					initialAnsi.lastIndexOf("\x1b[?47h"),
				);
				const exitAltIndex = Math.max(
					initialAnsi.lastIndexOf("\x1b[?1049l"),
					initialAnsi.lastIndexOf("\x1b[?47l"),
				);
				if (enterAltIndex !== -1 || exitAltIndex !== -1) {
					isAlternateScreenRef.current = enterAltIndex > exitAltIndex;
				}

				const bracketEnableIndex = initialAnsi.lastIndexOf("\x1b[?2004h");
				const bracketDisableIndex = initialAnsi.lastIndexOf("\x1b[?2004l");
				if (bracketEnableIndex !== -1 || bracketDisableIndex !== -1) {
					isBracketedPasteRef.current =
						bracketEnableIndex > bracketDisableIndex;
				}
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

					scheduleFitAndScroll();
				});

				if (result.snapshot?.cwd) {
					updateCwdRef.current(result.snapshot.cwd);
				} else {
					updateCwdRef.current(initialAnsi);
				}
				return;
			}

			const rehydrateSequences = result.snapshot?.rehydrateSequences ?? "";

			const finalizeRestore = () => {
				isStreamReadyRef.current = true;
				scheduleFitAndScroll();
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
				updateCwdRef.current(result.snapshot.cwd);
			} else {
				updateCwdRef.current(initialAnsi);
			}
		} catch (error) {
			console.error("[Terminal] Restoration failed:", error);
			isStreamReadyRef.current = true;
			flushPendingEvents();
		}
	}, [
		paneId,
		xtermRef,
		fitAddonRef,
		pendingEventsRef,
		isAlternateScreenRef,
		isBracketedPasteRef,
		modeScanBufferRef,
		flushPendingEvents,
	]);

	return {
		isStreamReadyRef,
		didFirstRenderRef,
		pendingInitialStateRef,
		restoreSequenceRef,
		maybeApplyInitialState,
		flushPendingEvents,
	};
}
