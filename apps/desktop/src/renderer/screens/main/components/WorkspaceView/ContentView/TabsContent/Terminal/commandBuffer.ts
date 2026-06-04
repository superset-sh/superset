import type { Terminal as XTerm } from "@xterm/xterm";
import stripAnsi from "strip-ansi";

const MAX_TITLE_LENGTH = 32;

export function sanitizeForTitle(text: string): string | null {
	const cleaned = stripAnsi(text).trim().slice(0, MAX_TITLE_LENGTH);

	return cleaned || null;
}

function getVisiblePromptBlockToCursor(xterm: XTerm): string | null {
	const active = xterm.buffer.active;
	const lineIndex = active.cursorY + active.viewportY;
	const currentLine = active.getLine(lineIndex);
	if (!currentLine) return null;

	let startIndex = lineIndex;
	while (startIndex > 0) {
		const line = active.getLine(startIndex);
		if (!line?.isWrapped) break;
		startIndex -= 1;
	}

	let rendered = "";
	for (let index = startIndex; index <= lineIndex; index += 1) {
		const line = active.getLine(index);
		if (!line) return null;

		const text = line.translateToString(true);
		rendered += index === lineIndex ? text.slice(0, active.cursorX) : text;
	}

	return rendered;
}

export function isCommandEchoed(xterm: XTerm, command: string): boolean {
	const normalizedCommand = stripAnsi(command).trimEnd();
	if (!normalizedCommand) return false;

	const renderedPromptBlock = getVisiblePromptBlockToCursor(xterm);
	if (!renderedPromptBlock) return false;

	return renderedPromptBlock.trimEnd().endsWith(normalizedCommand);
}
