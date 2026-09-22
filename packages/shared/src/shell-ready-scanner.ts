/**
 * OSC 133 shell readiness scanner (FinalTerm semantic prompt standard).
 *
 * Pure scanning logic, byte-oriented — no per-chunk UTF-8 decoding hop.
 * The marker (`\x1b]133;A...\x07`) is pure ASCII, so byte-level matching
 * is identical to char-level matching while letting callers keep PTY
 * output as opaque bytes from the daemon all the way to xterm.js.
 *
 * The OSC string terminator is either BEL (0x07) or ST (ESC \, 0x1b 0x5c);
 * both are recognized.
 *
 * Protocol ref: https://gitlab.freedesktop.org/Per_Bothner/specifications/blob/master/proposals/semantic-prompts.md
 * Vendored from WezTerm (MIT, Copyright 2018-Present Wez Furlong).
 */

const OSC_133_A_BYTES = Uint8Array.from(
	[..."\x1b]133;A"].map((c) => c.charCodeAt(0)),
);
const BEL_BYTE = 0x07;
const ESC_BYTE = 0x1b;
const BACKSLASH_BYTE = 0x5c;

/** Shells whose wrapper files inject OSC 133 markers. */
export const SHELLS_WITH_READY_MARKER = new Set(["zsh", "bash", "fish"]);

/**
 * Mutable state for the byte-by-byte scanner.
 * Callers should create one per terminal session via {@link createScanState}.
 */
export interface ShellReadyScanState {
	matchPos: number;
	/** Bytes withheld from output while a match is in progress. */
	heldBytes: number[];
	/** True when the last held byte was ESC, potentially starting ST (ESC \). */
	awaitingST: boolean;
}

export interface ShellReadyScanResult {
	// Tight ArrayBuffer-backed shape: matches Buffer and what
	// hono/ws WSContext.send accepts, so callers don't need casts.
	output: Uint8Array<ArrayBuffer>;
	matched: boolean;
}

export function createScanState(): ShellReadyScanState {
	return { matchPos: 0, heldBytes: [], awaitingST: false };
}

/**
 * Scan a chunk of PTY output for the OSC 133;A (prompt start) marker.
 *
 * Matching bytes are held back from output. On full match (prefix + optional
 * params + string terminator), they're discarded and `matched` is true.
 * On mismatch, held bytes are flushed as regular terminal output.
 *
 * Both OSC string terminators are recognized: BEL (0x07) and ST (ESC \).
 * The scanner handles the marker spanning multiple data chunks.
 */
export function scanForShellReady(
	state: ShellReadyScanState,
	data: Uint8Array,
): ShellReadyScanResult {
	const out: number[] = [];

	for (let i = 0; i < data.length; i++) {
		const b = data[i] as number;
		if (state.matchPos < OSC_133_A_BYTES.length) {
			if (b === OSC_133_A_BYTES[state.matchPos]) {
				state.heldBytes.push(b);
				state.matchPos++;
			} else {
				for (const h of state.heldBytes) out.push(h);
				state.heldBytes.length = 0;
				state.matchPos = 0;
				if (b === OSC_133_A_BYTES[0]) {
					state.heldBytes.push(b);
					state.matchPos = 1;
				} else {
					out.push(b);
				}
			}
		} else {
			if (state.awaitingST && b === BACKSLASH_BYTE) {
				return completeMatch(state, data, i, out);
			}
			state.awaitingST = b === ESC_BYTE;
			if (b === BEL_BYTE) {
				return completeMatch(state, data, i, out);
			}
			state.heldBytes.push(b);
		}
	}

	return { output: Uint8Array.from(out), matched: false };
}

function completeMatch(
	state: ShellReadyScanState,
	data: Uint8Array,
	i: number,
	out: number[],
): ShellReadyScanResult {
	state.heldBytes.length = 0;
	state.matchPos = 0;
	state.awaitingST = false;
	const remaining = data.subarray(i + 1);
	const head = Uint8Array.from(out);
	if (remaining.length === 0) {
		return { output: head, matched: true };
	}
	const merged = new Uint8Array(head.length + remaining.length);
	merged.set(head, 0);
	merged.set(remaining, head.length);
	return { output: merged, matched: true };
}
