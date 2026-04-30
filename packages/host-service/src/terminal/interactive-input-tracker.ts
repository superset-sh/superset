const MAX_INTERACTIVE_COMMAND_CHARS = 20_000;
const MAX_SUBMITTED_COMMANDS = 16;
const ESC = "\x1b";
const BEL = "\x07";
const ST = "\x1b\\";

export interface InteractiveInputState {
	line: string;
	submittedCommands: string[];
	escapeSequence: string | null;
}

export function createInteractiveInputState(): InteractiveInputState {
	return {
		line: "",
		submittedCommands: [],
		escapeSequence: null,
	};
}

export function recordInteractiveInput(
	state: InteractiveInputState,
	data: string,
): void {
	for (const char of data) {
		if (state.escapeSequence !== null) {
			state.escapeSequence += char;
			if (isCompleteEscapeSequence(state.escapeSequence)) {
				state.escapeSequence = null;
			}
			continue;
		}

		if (char === ESC) {
			state.escapeSequence = ESC;
			continue;
		}

		if (char === "\r" || char === "\n") {
			const command = state.line.trimEnd();
			if (command) {
				state.submittedCommands.push(command);
				while (state.submittedCommands.length > MAX_SUBMITTED_COMMANDS) {
					state.submittedCommands.shift();
				}
			}
			state.line = "";
			continue;
		}

		if (char === "\x7f" || char === "\b") {
			state.line = Array.from(state.line).slice(0, -1).join("");
			continue;
		}

		if (char === "\x15" || char === "\x03" || char === "\x04") {
			state.line = "";
			continue;
		}

		if (char === "\x17") {
			state.line = state.line.replace(/\S+\s*$/, "");
			continue;
		}

		if (char < " " && char !== "\t") continue;
		if (char === "\t") continue;

		if (Array.from(state.line).length < MAX_INTERACTIVE_COMMAND_CHARS) {
			state.line += char;
		}
	}
}

export function consumeInteractiveCommand(
	state: InteractiveInputState,
): string | null {
	return state.submittedCommands.shift() ?? null;
}

export function clearInteractiveInputState(state: InteractiveInputState): void {
	state.line = "";
	state.submittedCommands = [];
	state.escapeSequence = null;
}

function isCompleteEscapeSequence(sequence: string): boolean {
	if (sequence === ESC) return false;
	if (sequence.startsWith(`${ESC}]`)) {
		return sequence.endsWith(BEL) || sequence.endsWith(ST);
	}
	if (sequence.length === 2) return false;

	const last = sequence.at(-1);
	return Boolean(last && last >= "@" && last <= "~");
}
