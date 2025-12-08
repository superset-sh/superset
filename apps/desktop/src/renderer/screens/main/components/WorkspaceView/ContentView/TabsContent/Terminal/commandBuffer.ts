const ENTER = ["\r", "\n"];
const BACKSPACE = ["\x7f", "\b"];
const CANCEL = ["\x03", "\x15"]; // Ctrl+C, Ctrl+U

export type CommandBufferResult = {
	buffer: string;
	submittedCommand: string | null;
};

export function processCommandInput(
	currentBuffer: string,
	input: string,
): CommandBufferResult {
	const hasEnter = ENTER.some((char) => input.includes(char));
	const hasBackspace = BACKSPACE.some((char) => input.includes(char));
	const hasCancel = CANCEL.some((char) => input.includes(char));

	if (hasEnter) {
		const command = currentBuffer.trim();
		return {
			buffer: "",
			submittedCommand: command || null,
		};
	}

	if (hasBackspace) {
		return {
			buffer: currentBuffer.slice(0, -1),
			submittedCommand: null,
		};
	}

	if (hasCancel) {
		return {
			buffer: "",
			submittedCommand: null,
		};
	}

	const printableChars = input.replace(/[^\x20-\x7e\t]/g, "");
	return {
		buffer: currentBuffer + printableChars,
		submittedCommand: null,
	};
}
