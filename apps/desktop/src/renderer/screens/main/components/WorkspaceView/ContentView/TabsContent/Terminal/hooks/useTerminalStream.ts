import { toast } from "@superset/ui/sonner";
import type { Terminal as XTerm } from "@xterm/xterm";
import { useCallback, useRef } from "react";
import { isTerminalKilledByUser } from "renderer/lib/terminal-kill-tracking";
import { useTabsStore } from "renderer/stores/tabs/store";
import { DEBUG_TERMINAL } from "../config";
import type { TerminalStreamEvent } from "../types";

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
			`[useTerminalStream] [${new Date().toISOString()}] [${context}] Detected scroll-affecting sequences in ${data.length}b:`,
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

export interface UseTerminalStreamOptions {
	paneId: string;
	xtermRef: React.MutableRefObject<XTerm | null>;
	isStreamReadyRef: React.MutableRefObject<boolean>;
	isExitedRef: React.MutableRefObject<boolean>;
	wasKilledByUserRef: React.MutableRefObject<boolean>;
	pendingEventsRef: React.MutableRefObject<TerminalStreamEvent[]>;
	setExitStatus: (status: "killed" | "exited" | null) => void;
	setConnectionError: (error: string | null) => void;
	updateModesFromData: (data: string) => void;
	updateCwdFromData: (data: string) => void;
}

export interface UseTerminalStreamReturn {
	handleTerminalExit: (exitCode: number, xterm: XTerm) => void;
	handleStreamError: (
		event: Extract<TerminalStreamEvent, { type: "error" }>,
		xterm: XTerm,
	) => void;
	handleStreamData: (event: TerminalStreamEvent) => void;
}

/**
 * Hook to handle terminal stream events (data, exit, disconnect, error).
 */
export function useTerminalStream({
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
}: UseTerminalStreamOptions): UseTerminalStreamReturn {
	const setPaneStatus = useTabsStore((s) => s.setPaneStatus);
	const firstStreamDataReceivedRef = useRef(false);

	// Refs to use latest values in callbacks
	const updateModesRef = useRef(updateModesFromData);
	updateModesRef.current = updateModesFromData;
	const updateCwdRef = useRef(updateCwdFromData);
	updateCwdRef.current = updateCwdFromData;

	const handleTerminalExit = useCallback(
		(exitCode: number, xterm: XTerm) => {
			isExitedRef.current = true;
			isStreamReadyRef.current = false;

			const wasKilledByUser = isTerminalKilledByUser(paneId);
			wasKilledByUserRef.current = wasKilledByUser;
			setExitStatus(wasKilledByUser ? "killed" : "exited");

			if (wasKilledByUser) {
				xterm.writeln("\r\n\r\n[Session killed]");
				xterm.writeln("[Restart to start a new session]");
			} else {
				xterm.writeln(`\r\n\r\n[Process exited with code ${exitCode}]`);
				xterm.writeln("[Press any key to restart]");
			}

			// Clear transient pane status on terminal exit
			const currentPane = useTabsStore.getState().panes[paneId];
			if (
				currentPane?.status === "working" ||
				currentPane?.status === "permission"
			) {
				setPaneStatus(paneId, "idle");
			}
		},
		[
			paneId,
			isExitedRef,
			isStreamReadyRef,
			wasKilledByUserRef,
			setExitStatus,
			setPaneStatus,
		],
	);

	const handleStreamError = useCallback(
		(event: Extract<TerminalStreamEvent, { type: "error" }>, xterm: XTerm) => {
			const message = event.code
				? `${event.code}: ${event.error}`
				: event.error;
			console.warn("[Terminal] stream error:", message);

			if (
				event.code === "WRITE_FAILED" &&
				event.error?.includes("Session not found")
			) {
				setConnectionError("Session lost - click to reconnect");
				return;
			}

			if (
				event.code === "WRITE_FAILED" &&
				event.error?.includes("PTY not spawned")
			) {
				xterm.writeln(`\r\n[Terminal] ${message}`);
				return;
			}

			toast.error("Terminal error", { description: message });

			if (event.code === "WRITE_QUEUE_FULL" || event.code === "WRITE_FAILED") {
				xterm.writeln(`\r\n[Terminal] ${message}`);
			} else {
				setConnectionError(message);
			}
		},
		[setConnectionError],
	);

	const handleStreamData = useCallback(
		(event: TerminalStreamEvent) => {
			const xterm = xtermRef.current;
			const isReady = Boolean(xterm) && isStreamReadyRef.current;

			if (event.type === "data") {
				const context = isReady
					? `STREAM_DATA_${paneId}`
					: `QUEUED_DATA_${paneId}`;
				detectScrollAffectingSequences(event.data, context);
			}

			// Queue ALL events until terminal is ready, preserving order
			// flushPendingEvents will process them in sequence after restore
			if (!xterm || !isStreamReadyRef.current) {
				if (DEBUG_TERMINAL && event.type === "data") {
					console.log(
						`[Terminal] Queuing event (not ready): ${paneId}, type=${event.type}, bytes=${event.data.length}`,
					);
				}
				pendingEventsRef.current.push(event);
				return;
			}

			// Process events when stream is ready
			if (event.type === "data") {
				if (DEBUG_TERMINAL && !firstStreamDataReceivedRef.current) {
					firstStreamDataReceivedRef.current = true;
					console.log(
						`[Terminal] First stream data received: ${paneId}, ${event.data.length} bytes`,
					);
				}
				updateModesRef.current(event.data);
				xterm.write(event.data);
				updateCwdRef.current(event.data);
			} else if (event.type === "exit") {
				handleTerminalExit(event.exitCode, xterm);
			} else if (event.type === "disconnect") {
				setConnectionError(
					event.reason || "Connection to terminal daemon lost",
				);
			} else if (event.type === "error") {
				handleStreamError(event, xterm);
			}
		},
		[
			paneId,
			xtermRef,
			isStreamReadyRef,
			pendingEventsRef,
			handleTerminalExit,
			handleStreamError,
			setConnectionError,
		],
	);

	return {
		handleTerminalExit,
		handleStreamError,
		handleStreamData,
	};
}
