// Byte-oriented terminal-title OSC scanner.
//
// PTY output flows through here as raw bytes from the daemon, so the
// scanner runs over `Uint8Array` directly — no per-chunk UTF-8 decoding,
// no boundary-mangling. OSC framing is pure ASCII (ESC `]`, BEL, ST), so
// the framing pass is byte-cheap. Only the bounded title payload is
// decoded to a string, and only at the moment {@link normalizeTerminalTitle}
// needs codepoints to filter control characters and enforce a length cap.

const MAX_OSC_SEQUENCE_BYTES = 4096;
const MAX_TERMINAL_TITLE_LENGTH = 200;

const ESC_BYTE = 0x1b;
const BACKSLASH_BYTE = 0x5c; // ESC + '\' = ST
const RIGHT_BRACKET_BYTE = 0x5d; // ESC + ']' = OSC
const C1_OSC_BYTE = 0x9d;
const C1_ST_BYTE = 0x9c;
const BEL_BYTE = 0x07;

const sharedTitleTextDecoder = /* @__PURE__ */ new TextDecoder("utf-8", {
	fatal: false,
});

export interface TerminalTitleScanState {
	/** Held bytes spanning a chunk boundary while an OSC sequence is mid-flight. */
	buffer: Uint8Array;
}

export interface TerminalTitleScanResult {
	updates: Array<string | null>;
}

export function createTerminalTitleScanState(): TerminalTitleScanState {
	return { buffer: new Uint8Array(0) };
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

function findOscStart(
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

function findOscTerminator(
	input: Uint8Array,
	from: number,
): { index: number; length: number } | null {
	for (let i = from; i < input.length; i++) {
		const b = input[i];
		if (b === BEL_BYTE) return { index: i, length: 1 };
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

// `subarray` returns a view into the original chunk's ArrayBuffer, which
// would pin the entire (potentially multi-KB) chunk in memory just to hold
// a few trailing bytes mid-OSC. Copy the slice into a fresh tiny buffer
// before persisting in scanner state.
function copySlice(input: Uint8Array, start: number, end?: number): Uint8Array {
	const view =
		end === undefined ? input.subarray(start) : input.subarray(start, end);
	const copy = new Uint8Array(view.length);
	copy.set(view, 0);
	return copy;
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
	chunk: Uint8Array,
): TerminalTitleScanResult {
	const input =
		state.buffer.length === 0 ? chunk : concatBytes(state.buffer, chunk);
	const updates: Array<string | null> = [];
	let searchIndex = 0;

	while (searchIndex < input.length) {
		const oscStart = findOscStart(input, searchIndex);
		if (!oscStart) {
			// Hold a trailing ESC so a `]` arriving in the next chunk still
			// resolves to an OSC start.
			state.buffer =
				input.length > 0 && input[input.length - 1] === ESC_BYTE
					? copySlice(input, input.length - 1)
					: new Uint8Array(0);
			return { updates };
		}

		const payloadStart = oscStart.index + oscStart.length;
		const terminator = findOscTerminator(input, payloadStart);
		if (!terminator) {
			const sequenceLen = input.length - oscStart.index;
			state.buffer =
				sequenceLen <= MAX_OSC_SEQUENCE_BYTES
					? copySlice(input, oscStart.index)
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
