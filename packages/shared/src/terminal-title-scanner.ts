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
