const ESC = "\x1b";
const OSC = `${ESC}]`;
const C1_OSC = "\x9d";
const BEL = "\x07";
const ST = `${ESC}\\`;
const C1_ST = "\x9c";

const MAX_OSC_SEQUENCE_BYTES = 4096;
const MAX_TERMINAL_TITLE_LENGTH = 200;

export interface TerminalTitleScanState {
	buffer: string;
}

export interface TerminalTitleScanResult {
	updates: Array<string | null>;
}

export function createTerminalTitleScanState(): TerminalTitleScanState {
	return { buffer: "" };
}

export function normalizeTerminalTitle(title: string): string | null {
	const normalized = Array.from(title)
		.filter((char) => {
			const codePoint = char.codePointAt(0) ?? 0;
			return !(
				codePoint <= 0x1f ||
				codePoint === 0x7f ||
				(codePoint >= 0x80 && codePoint <= 0x9f)
			);
		})
		.join("")
		.trim();
	if (!normalized) return null;

	const chars = Array.from(normalized);
	if (chars.length <= MAX_TERMINAL_TITLE_LENGTH) return normalized;
	return chars.slice(0, MAX_TERMINAL_TITLE_LENGTH).join("");
}

function getUtf8ByteLength(value: string): number {
	let bytes = 0;
	for (const char of value) {
		const codePoint = char.codePointAt(0) ?? 0;
		if (codePoint <= 0x7f) {
			bytes += 1;
		} else if (codePoint <= 0x7ff) {
			bytes += 2;
		} else if (codePoint <= 0xffff) {
			bytes += 3;
		} else {
			bytes += 4;
		}
	}
	return bytes;
}

function findOscTerminator(
	input: string,
	fromIndex: number,
): { index: number; length: number } | null {
	for (let i = fromIndex; i < input.length; i++) {
		const ch = input[i];
		if (ch === BEL) return { index: i, length: BEL.length };
		if (ch === C1_ST) return { index: i, length: C1_ST.length };
		if (ch === ESC && input.startsWith(ST, i)) {
			return { index: i, length: ST.length };
		}
	}
	return null;
}

function findOscStart(
	input: string,
	fromIndex: number,
): { index: number; length: number } | null {
	const escOscIndex = input.indexOf(OSC, fromIndex);
	const c1OscIndex = input.indexOf(C1_OSC, fromIndex);

	if (escOscIndex === -1 && c1OscIndex === -1) return null;
	if (escOscIndex === -1) return { index: c1OscIndex, length: C1_OSC.length };
	if (c1OscIndex === -1 || escOscIndex < c1OscIndex) {
		return { index: escOscIndex, length: OSC.length };
	}
	return { index: c1OscIndex, length: C1_OSC.length };
}

function parseTitlePayload(payload: string): string | null | undefined {
	const firstSeparator = payload.indexOf(";");
	if (firstSeparator <= 0) return undefined;

	const command = payload.slice(0, firstSeparator);
	const value = payload.slice(firstSeparator + 1);

	if (command === "0" || command === "2") {
		return normalizeTerminalTitle(value);
	}

	if (command !== "9") return undefined;
	if (value === "3;") return null;
	if (!value.startsWith("3;")) return undefined;
	return normalizeTerminalTitle(value.slice(2));
}

// ---------- Byte-oriented variant (v2 PTY data path) ----------
//
// The string variant above forces a per-chunk `Buffer.toString("utf8")`
// upstream, which loses partial codepoints at chunk boundaries. v2 carries
// PTY data as bytes end-to-end. OSC framing is pure ASCII (ESC `]`, BEL,
// ST), so the *framing* runs cheaply over bytes; only the title payload
// itself needs to be decoded — and at that point we have a complete,
// terminator-bounded slice, so the decode is lossless.

const ESC_BYTE = 0x1b;
const BACKSLASH_BYTE = 0x5c; // ESC + '\' = ST
const RIGHT_BRACKET_BYTE = 0x5d; // ESC + ']' = OSC
const C1_OSC_BYTE = 0x9d;
const C1_ST_BYTE = 0x9c;
const BEL_TITLE_BYTE = 0x07;

const sharedTitleTextDecoder = /* @__PURE__ */ new TextDecoder("utf-8", {
	fatal: false,
});

export interface TerminalTitleScanStateBytes {
	/** Held bytes spanning a chunk boundary while an OSC sequence is mid-flight. */
	buffer: Uint8Array;
}

export function createTerminalTitleScanStateBytes(): TerminalTitleScanStateBytes {
	return { buffer: new Uint8Array(0) };
}

function findOscStartBytes(
	input: Uint8Array,
	from: number,
): { index: number; length: number } | null {
	for (let i = from; i < input.length; i++) {
		const b = input[i];
		if (b === C1_OSC_BYTE) return { index: i, length: 1 };
		if (
			b === ESC_BYTE &&
			i + 1 < input.length &&
			input[i + 1] === RIGHT_BRACKET_BYTE
		) {
			return { index: i, length: 2 };
		}
	}
	return null;
}

function findOscTerminatorBytes(
	input: Uint8Array,
	from: number,
): { index: number; length: number } | null {
	for (let i = from; i < input.length; i++) {
		const b = input[i];
		if (b === BEL_TITLE_BYTE) return { index: i, length: 1 };
		if (b === C1_ST_BYTE) return { index: i, length: 1 };
		if (
			b === ESC_BYTE &&
			i + 1 < input.length &&
			input[i + 1] === BACKSLASH_BYTE
		) {
			return { index: i, length: 2 };
		}
	}
	return null;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
	if (a.length === 0) return b;
	if (b.length === 0) return a;
	const out = new Uint8Array(a.length + b.length);
	out.set(a, 0);
	out.set(b, a.length);
	return out;
}

/**
 * Byte-oriented title scanner. Framing is matched on bytes; once a complete
 * payload is bounded by its OSC start and terminator, the slice is decoded
 * to a string for {@link normalizeTerminalTitle} (which needs codepoints
 * to filter control characters and enforce a length cap).
 */
export function scanForTerminalTitleBytes(
	state: TerminalTitleScanStateBytes,
	chunk: Uint8Array,
): TerminalTitleScanResult {
	const input =
		state.buffer.length === 0 ? chunk : concatBytes(state.buffer, chunk);
	const updates: Array<string | null> = [];
	let searchIndex = 0;

	while (searchIndex < input.length) {
		const oscStart = findOscStartBytes(input, searchIndex);
		if (!oscStart) {
			// Hold a trailing ESC so a `]` arriving in the next chunk still gets
			// recognized as OSC start.
			state.buffer =
				input.length > 0 && input[input.length - 1] === ESC_BYTE
					? input.subarray(input.length - 1)
					: new Uint8Array(0);
			return { updates };
		}

		const payloadStart = oscStart.index + oscStart.length;
		const terminator = findOscTerminatorBytes(input, payloadStart);
		if (!terminator) {
			const sequence = input.subarray(oscStart.index);
			state.buffer =
				sequence.length <= MAX_OSC_SEQUENCE_BYTES
					? sequence
					: new Uint8Array(0);
			return { updates };
		}

		const payloadBytes = input.subarray(payloadStart, terminator.index);
		const payload = sharedTitleTextDecoder.decode(payloadBytes);
		const title = parseTitlePayload(payload);
		if (title !== undefined) {
			updates.push(title);
		}

		searchIndex = terminator.index + terminator.length;
	}

	state.buffer = new Uint8Array(0);
	return { updates };
}

/**
 * Scan PTY output for terminal title OSC sequences.
 *
 * Supported sequences:
 * - OSC 0;<title> BEL/ST
 * - OSC 2;<title> BEL/ST
 * - OSC 9;3;<title> BEL/ST (ConEmu tab title)
 * - OSC 9;3; BEL/ST reset
 *
 * OSC may be encoded as ESC ] or the single-byte C1 introducer.
 * ST may be encoded as ESC \ or the single-byte C1 terminator.
 */
export function scanForTerminalTitle(
	state: TerminalTitleScanState,
	chunk: string,
): TerminalTitleScanResult {
	const input = state.buffer ? state.buffer + chunk : chunk;
	const updates: Array<string | null> = [];
	let searchIndex = 0;

	while (searchIndex < input.length) {
		const oscStart = findOscStart(input, searchIndex);
		if (!oscStart) {
			state.buffer = input.endsWith(ESC) ? ESC : "";
			return { updates };
		}

		const payloadStart = oscStart.index + oscStart.length;
		const terminator = findOscTerminator(input, payloadStart);
		if (!terminator) {
			const sequence = input.slice(oscStart.index);
			state.buffer =
				getUtf8ByteLength(sequence) <= MAX_OSC_SEQUENCE_BYTES ? sequence : "";
			return { updates };
		}

		const payload = input.slice(payloadStart, terminator.index);
		const title = parseTitlePayload(payload);
		if (title !== undefined) {
			updates.push(title);
		}

		searchIndex = terminator.index + terminator.length;
	}

	state.buffer = "";
	return { updates };
}
