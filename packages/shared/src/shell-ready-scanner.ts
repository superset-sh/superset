/**
 * OSC 133 shell readiness scanner (FinalTerm semantic prompt standard).
 *
 * Pure scanning logic — no side effects. Callers handle their own readiness
 * resolution (promises, state machines, event broadcasts, etc.).
 *
 * Protocol ref: https://gitlab.freedesktop.org/Per_Bothner/specifications/blob/master/proposals/semantic-prompts.md
 * Vendored from WezTerm (MIT, Copyright 2018-Present Wez Furlong).
 */

/** The OSC 133;A prefix that signals shell prompt start (= shell ready). */
const OSC_133_A = "\x1b]133;A";

/** Shells whose wrapper files inject OSC 133 markers. */
export const SHELLS_WITH_READY_MARKER = new Set(["zsh", "bash", "fish"]);

/**
 * Mutable state for the character-by-character scanner.
 * Callers should create one per terminal session via {@link createScanState}.
 */
export interface ShellReadyScanState {
	matchPos: number;
	heldBytes: string;
}

export interface ShellReadyScanResult {
	/** Output data with the marker stripped (if found). */
	output: string;
	/** Whether the full OSC 133;A marker was matched in this chunk. */
	matched: boolean;
}

export function createScanState(): ShellReadyScanState {
	return { matchPos: 0, heldBytes: "" };
}

/**
 * Scan a chunk of PTY output for the OSC 133;A (prompt start) marker.
 *
 * Matching bytes are held back from output. On full match (prefix + optional
 * params + string terminator `\a`), they're discarded and `matched` is true.
 * On mismatch, held bytes are flushed as regular terminal output.
 *
 * The scanner handles the marker spanning multiple data chunks.
 */
export function scanForShellReady(
	state: ShellReadyScanState,
	data: string,
): ShellReadyScanResult {
	let output = "";

	for (let i = 0; i < data.length; i++) {
		const ch = data[i] as string;
		if (state.matchPos < OSC_133_A.length) {
			// Still matching the "\x1b]133;A" prefix
			if (ch === OSC_133_A[state.matchPos]) {
				state.heldBytes += ch;
				state.matchPos++;
			} else {
				// Mismatch — flush held bytes, then re-test current char as a
				// fresh match start (e.g. stale ESC followed by real marker).
				output += state.heldBytes;
				state.heldBytes = "";
				state.matchPos = 0;
				if (ch === OSC_133_A[0]) {
					state.heldBytes = ch;
					state.matchPos = 1;
				} else {
					output += ch;
				}
			}
		} else {
			// Matched prefix — consume optional params until string terminator
			if (ch === "\x07") {
				// Full match — discard held bytes
				const remaining = data.slice(i + 1);
				state.heldBytes = "";
				state.matchPos = 0;
				return { output: output + remaining, matched: true };
			}
			// Consume optional params (e.g. ";cl=m;aid=123") before \a
			state.heldBytes += ch;
		}
	}

	return { output, matched: false };
}
