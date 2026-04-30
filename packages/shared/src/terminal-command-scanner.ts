const ESC = "\x1b";
const OSC = `${ESC}]`;
const C1_OSC = "\x9d";
const BEL = "\x07";
const ST = `${ESC}\\`;
const C1_ST = "\x9c";

const MAX_OSC_SEQUENCE_BYTES = 4096;

export type TerminalCommandEvent =
	| { type: "prompt" }
	| { type: "commandStart"; command: string | null }
	| { type: "commandFinish"; exitCode: number | null };

export interface TerminalCommandScanState {
	buffer: string;
}

export interface TerminalCommandScanResult {
	/** Terminal output with recognized command-integration OSC sequences removed. */
	output: string;
	events: TerminalCommandEvent[];
	items: Array<
		| { type: "output"; data: string }
		| { type: "event"; event: TerminalCommandEvent }
	>;
}

export function createTerminalCommandScanState(): TerminalCommandScanState {
	return { buffer: "" };
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

function parseExitCode(value: string | undefined): number | null {
	if (!value || !/^-?\d+$/.test(value)) return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseCommandEvent(payload: string): TerminalCommandEvent | null {
	const parts = payload.split(";");
	if (parts[0] !== "133") return null;

	const action = parts[1];
	if (action === "A") return { type: "prompt" };
	if (action === "C") {
		const command = parts.length > 2 ? parts.slice(2).join(";") : "";
		return { type: "commandStart", command: command || null };
	}
	if (action === "D") {
		return { type: "commandFinish", exitCode: parseExitCode(parts[2]) };
	}
	return null;
}

/**
 * Scan PTY output for OSC 133 command-integration markers.
 *
 * Recognized sequences are stripped from terminal output:
 * - OSC 133;A BEL/ST: prompt started
 * - OSC 133;C(;command) BEL/ST: command started
 * - OSC 133;D;{exitCode} BEL/ST: command finished
 *
 * Unsupported OSC sequences are preserved exactly so terminal behavior remains
 * unchanged for title updates, hyperlinks, and shell-specific extensions.
 */
export function scanForTerminalCommandEvents(
	state: TerminalCommandScanState,
	chunk: string,
): TerminalCommandScanResult {
	const input = state.buffer ? state.buffer + chunk : chunk;
	const events: TerminalCommandEvent[] = [];
	const items: TerminalCommandScanResult["items"] = [];
	let output = "";
	let searchIndex = 0;

	const pushOutput = (data: string) => {
		if (!data) return;
		output += data;
		const last = items[items.length - 1];
		if (last?.type === "output") {
			last.data += data;
		} else {
			items.push({ type: "output", data });
		}
	};

	const pushEvent = (event: TerminalCommandEvent) => {
		events.push(event);
		items.push({ type: "event", event });
	};

	while (searchIndex < input.length) {
		const oscStart = findOscStart(input, searchIndex);
		if (!oscStart) {
			if (input.endsWith(ESC)) {
				pushOutput(input.slice(searchIndex, input.length - ESC.length));
				state.buffer = ESC;
			} else {
				pushOutput(input.slice(searchIndex));
				state.buffer = "";
			}
			return { output, events, items };
		}

		pushOutput(input.slice(searchIndex, oscStart.index));
		const payloadStart = oscStart.index + oscStart.length;
		const terminator = findOscTerminator(input, payloadStart);
		if (!terminator) {
			const sequence = input.slice(oscStart.index);
			if (getUtf8ByteLength(sequence) <= MAX_OSC_SEQUENCE_BYTES) {
				state.buffer = sequence;
			} else {
				pushOutput(sequence);
				state.buffer = "";
			}
			return { output, events, items };
		}

		const payload = input.slice(payloadStart, terminator.index);
		const event = parseCommandEvent(payload);
		const sequenceEnd = terminator.index + terminator.length;
		if (event) {
			pushEvent(event);
		} else {
			pushOutput(input.slice(oscStart.index, sequenceEnd));
		}

		searchIndex = sequenceEnd;
	}

	state.buffer = "";
	return { output, events, items };
}
