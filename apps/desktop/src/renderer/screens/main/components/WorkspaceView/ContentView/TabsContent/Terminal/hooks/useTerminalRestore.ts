import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useCallback, useRef } from "react";
import { DEBUG_TERMINAL } from "../config";
import type { CreateOrAttachResult, TerminalStreamEvent } from "../types";
import { scrollToBottom } from "../utils";

const DEBUG_SCROLL_SEQUENCES = true;

/**
 * Build scroll-affecting sequence patterns lazily to avoid lint errors
 * with control characters in regex literals. Uses string-based patterns.
 */
function buildScrollAffectingSequences(): Array<{
	pattern: RegExp;
	name: string;
	description: string;
}> {
	// ESC character as escaped string for building regex patterns
	const ESC_PATTERN = "\\x1b";

	return [
		{
			pattern: new RegExp(`${ESC_PATTERN}\\[H`, "g"),
			name: "CUP_HOME",
			description: "Cursor to home position (top-left)",
		},
		{
			pattern: new RegExp(`${ESC_PATTERN}\\[\\d*;\\d*H`, "g"),
			name: "CUP",
			description: "Cursor position (move cursor)",
		},
		{
			pattern: new RegExp(`${ESC_PATTERN}\\[2J`, "g"),
			name: "ED_FULL",
			description: "Clear entire screen",
		},
		{
			pattern: new RegExp(`${ESC_PATTERN}\\[3J`, "g"),
			name: "ED_SCROLLBACK",
			description: "Clear scrollback buffer",
		},
		{
			pattern: new RegExp(`${ESC_PATTERN}\\[\\?1049h`, "g"),
			name: "ALT_SCREEN_ENTER",
			description: "Enter alternate screen buffer",
		},
		{
			pattern: new RegExp(`${ESC_PATTERN}\\[\\?1049l`, "g"),
			name: "ALT_SCREEN_EXIT",
			description: "Exit alternate screen buffer",
		},
		{
			pattern: new RegExp(`${ESC_PATTERN}\\[\\?47h`, "g"),
			name: "ALT_SCREEN_ENTER_LEGACY",
			description: "Enter alternate screen (legacy)",
		},
		{
			pattern: new RegExp(`${ESC_PATTERN}\\[\\?47l`, "g"),
			name: "ALT_SCREEN_EXIT_LEGACY",
			description: "Exit alternate screen (legacy)",
		},
		{
			pattern: new RegExp(`${ESC_PATTERN}\\[r`, "g"),
			name: "DECSTBM_RESET",
			description: "Reset scrolling region to full screen",
		},
		{
			pattern: new RegExp(`${ESC_PATTERN}\\[\\d+;\\d+r`, "g"),
			name: "DECSTBM",
			description: "Set scrolling region",
		},
		{
			pattern: new RegExp(`${ESC_PATTERN}\\[s`, "g"),
			name: "SCP",
			description: "Save cursor position",
		},
		{
			pattern: new RegExp(`${ESC_PATTERN}\\[u`, "g"),
			name: "RCP",
			description: "Restore cursor position",
		},
		{
			pattern: new RegExp(
				`${ESC_PATTERN}\\[0?m(?:${ESC_PATTERN}\\[H|${ESC_PATTERN}\\[2J)`,
				"g",
			),
			name: "RESET_AND_CLEAR",
			description: "Reset attributes and clear/home (common TUI pattern)",
		},
		{
			pattern: new RegExp(`${ESC_PATTERN}c`, "g"),
			name: "RIS",
			description: "Reset to Initial State (full terminal reset)",
		},
	];
}

// Lazy-initialized to avoid building patterns on module load
let scrollAffectingSequences: ReturnType<
	typeof buildScrollAffectingSequences
> | null = null;

function getScrollAffectingSequences() {
	if (!scrollAffectingSequences) {
		scrollAffectingSequences = buildScrollAffectingSequences();
	}
	return scrollAffectingSequences;
}

/**
 * Detect and log escape sequences that can affect scroll position.
 */
function detectScrollAffectingSequences(data: string, context: string): void {
	if (!DEBUG_SCROLL_SEQUENCES) return;

	const detectedSequences: Array<{
		name: string;
		description: string;
		count: number;
		positions: number[];
	}> = [];

	for (const seq of getScrollAffectingSequences()) {
		seq.pattern.lastIndex = 0;
		const matches = [...data.matchAll(seq.pattern)];
		if (matches.length > 0) {
			detectedSequences.push({
				name: seq.name,
				description: seq.description,
				count: matches.length,
				positions: matches.map((m) => m.index ?? -1),
			});
		}
	}

	if (detectedSequences.length > 0) {
		console.log(
			`[useTerminalRestore] [${new Date().toISOString()}] [${context}] Detected scroll-affecting sequences in ${data.length}b:`,
		);
		for (const seq of detectedSequences) {
			console.log(
				`  - ${seq.name}: ${seq.description} (count=${seq.count}, positions=[${seq.positions.slice(0, 5).join(", ")}${seq.positions.length > 5 ? "..." : ""}])`,
			);
		}
		// Log a snippet of the data around the first detected sequence for context
		const firstSeq = detectedSequences[0];
		if (firstSeq && firstSeq.positions[0] !== undefined) {
			const pos = firstSeq.positions[0];
			const snippetStart = Math.max(0, pos - 20);
			const snippetEnd = Math.min(data.length, pos + 40);
			const snippet = data
				.slice(snippetStart, snippetEnd)
				.replaceAll("\x1b", "\\x1b")
				.replace(/\n/g, "\\n")
				.replace(/\r/g, "\\r");
			console.log(`  Context: "...${snippet}..."`);
		}
	}
}

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
	/** Callback to send resize to PTY after fit() - ensures PTY dimensions match xterm */
	onResize: (cols: number, rows: number) => void;
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
	onResize,
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
	const onResizeRef = useRef(onResize);
	onResizeRef.current = onResize;

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
				// Detect scroll-affecting sequences in flushed pending events
				detectScrollAffectingSequences(event.data, "FLUSH_PENDING_EVENT");
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

		if (DEBUG_TERMINAL || DEBUG_SCROLL_SEQUENCES) {
			const snapshotAnsi = result.snapshot?.snapshotAnsi ?? "";
			const rehydrateSequences = result.snapshot?.rehydrateSequences ?? "";
			console.log(`[Terminal] Applying initial state: ${paneId}`, {
				isNew: result.isNew,
				hasSnapshot: Boolean(result.snapshot),
				scrollbackChars: result.scrollback.length,
				snapshotChars: snapshotAnsi.length,
				rehydrateChars: rehydrateSequences.length,
				modes: result.snapshot?.modes,
				pendingEvents: pendingEventsRef.current.length,
			});
		}

		const xterm = xtermRef.current;
		const fitAddon = fitAddonRef.current;
		if (!xterm || !fitAddon) return;

		// Clear before applying to prevent double-apply on concurrent triggers
		pendingInitialStateRef.current = null;
		++restoreSequenceRef.current;
		const restoreSequence = restoreSequenceRef.current;

		if (DEBUG_SCROLL_SEQUENCES) {
			console.log(
				`[useTerminalRestore] [${new Date().toISOString()}] [RESTORE_START] paneId=${paneId}, isNew=${result.isNew}`,
			);
			console.log(
				`  - snapshot present: ${!!result.snapshot}, scrollback size: ${result.scrollback?.length ?? 0}b`,
			);
			if (result.snapshot) {
				console.log(
					`  - snapshotAnsi size: ${result.snapshot.snapshotAnsi.length}b`,
				);
				console.log(
					`  - rehydrateSequences size: ${result.snapshot.rehydrateSequences.length}b`,
				);
				console.log(`  - modes: ${JSON.stringify(result.snapshot.modes)}`);
			}
		}

		try {
			const scheduleFitAndScroll = () => {
				requestAnimationFrame(() => {
					if (xtermRef.current !== xterm) return;
					if (restoreSequenceRef.current !== restoreSequence) return;
					fitAddon.fit();
					// Send resize to PTY after fit() to ensure dimensions are synced.
					// This fixes the race condition where createOrAttach uses stale dimensions
					// from before the container was fully laid out.
					onResizeRef.current(xterm.cols, xterm.rows);
					// Only scroll to bottom for NEW sessions. For reattached sessions,
					// the snapshot already positions the viewport correctly and we should
					// not override the user's scroll position.
					if (result.isNew) {
						// Write empty string with callback to ensure all pending writes are
						// processed before scrolling. xterm.write() is async and buffers writes,
						// so scrollToBottom() called immediately might not see all content.
						xterm.write("", () => scrollToBottom(xterm));
					}
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
				if (DEBUG_SCROLL_SEQUENCES) {
					console.log(
						`[useTerminalRestore] [${new Date().toISOString()}] [ALT_SCREEN_REATTACH] Writing alt screen enter sequence`,
					);
				}
				xterm.write("\x1b[?1049h", () => {
					if (result.snapshot?.rehydrateSequences) {
						const ESC = "\x1b";
						const filteredRehydrate = result.snapshot.rehydrateSequences
							.split(`${ESC}[?1049h`)
							.join("")
							.split(`${ESC}[?47h`)
							.join("");
						if (filteredRehydrate) {
							if (DEBUG_SCROLL_SEQUENCES) {
								console.log(
									`[useTerminalRestore] [${new Date().toISOString()}] [ALT_SCREEN_REATTACH] Writing filtered rehydrate sequences (${filteredRehydrate.length}b)`,
								);
								detectScrollAffectingSequences(
									filteredRehydrate,
									"ALT_REHYDRATE_WRITE",
								);
							}
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
				if (DEBUG_SCROLL_SEQUENCES) {
					console.log(
						`[useTerminalRestore] [${new Date().toISOString()}] [SNAPSHOT_WRITE] Writing snapshotAnsi (${initialAnsi.length}b)`,
					);
					detectScrollAffectingSequences(initialAnsi, "SNAPSHOT_ANSI_WRITE");
				}
				xterm.write(initialAnsi, finalizeRestore);
			};

			if (rehydrateSequences) {
				if (DEBUG_SCROLL_SEQUENCES) {
					console.log(
						`[useTerminalRestore] [${new Date().toISOString()}] [REHYDRATE_WRITE] Writing rehydrateSequences (${rehydrateSequences.length}b)`,
					);
					detectScrollAffectingSequences(rehydrateSequences, "REHYDRATE_WRITE");
				}
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
