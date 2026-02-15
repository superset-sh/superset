import type { ILink } from "@xterm/xterm";

export function calculateLinkRange({
	linkStart,
	linkEnd,
	prevLineLength,
	lineLength,
	bufferLineNumber,
	isCurrentLineWrapped,
	nextLineIsWrapped,
}: {
	linkStart: number;
	linkEnd: number;
	prevLineLength: number;
	lineLength: number;
	bufferLineNumber: number;
	isCurrentLineWrapped: boolean;
	nextLineIsWrapped: boolean;
}): ILink["range"] {
	const currentLineStart = prevLineLength;
	const currentLineEnd = prevLineLength + lineLength;

	const startsInPrevLine = isCurrentLineWrapped && linkStart < currentLineStart;
	const endsInNextLine = nextLineIsWrapped && linkEnd > currentLineEnd;

	let startY: number;
	let startX: number;
	let endY: number;
	let endX: number;

	if (startsInPrevLine) {
		startY = bufferLineNumber - 1;
		startX = linkStart + 1;
	} else {
		startY = bufferLineNumber;
		startX = linkStart - currentLineStart + 1;
	}

	if (endsInNextLine) {
		endY = bufferLineNumber + 1;
		endX = linkEnd - currentLineEnd + 1;
	} else if (linkEnd <= currentLineStart) {
		endY = bufferLineNumber - 1;
		endX = linkEnd + 1;
	} else {
		endY = bufferLineNumber;
		endX = linkEnd - currentLineStart + 1;
	}

	return {
		start: { x: startX, y: startY },
		end: { x: endX, y: endY },
	};
}
