import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";
import { parseLineColumnPath } from "line-column-path";

export class FilePathLinkProvider implements ILinkProvider {
	private readonly FILE_PATH_PATTERN =
		/((?:~|\.{1,2})?\/[^\s:()]+|(?:\.?[a-zA-Z0-9_-]+\/)+[a-zA-Z0-9_\-.]+)(?::(\d+))?(?::(\d+))?/;

	constructor(
		private readonly terminal: Terminal,
		private readonly onOpen: (
			event: MouseEvent,
			path: string,
			line?: number,
			column?: number,
		) => void,
	) {}

	provideLinks(
		bufferLineNumber: number,
		callback: (links: ILink[] | undefined) => void,
	): void {
		const lineIndex = bufferLineNumber - 1;
		const line = this.terminal.buffer.active.getLine(lineIndex);
		if (!line) {
			callback(undefined);
			return;
		}

		const lineText = line.translateToString(true);
		const lineLength = lineText.length;
		const isCurrentLineWrapped = line.isWrapped;

		// Check previous line if current line is a wrapped continuation
		const prevLine = isCurrentLineWrapped
			? this.terminal.buffer.active.getLine(lineIndex - 1)
			: null;
		const prevLineText = prevLine ? prevLine.translateToString(true) : "";
		const prevLineLength = prevLineText.length;

		// Check if the next line is a wrapped continuation of this line
		const nextLine = this.terminal.buffer.active.getLine(lineIndex + 1);
		const nextLineIsWrapped = nextLine?.isWrapped ?? false;
		const nextLineText =
			nextLineIsWrapped && nextLine ? nextLine.translateToString(true) : "";

		// Combined text for matching paths that may span wrap points
		// Format: [prevLine] + currentLine + [nextLine]
		const combinedText = prevLineText + lineText + nextLineText;
		const currentLineOffset = prevLineLength; // Offset where current line starts in combined text

		const links: ILink[] = [];
		const regex = new RegExp(this.FILE_PATH_PATTERN, "g");

		for (const match of combinedText.matchAll(regex)) {
			const matchText = match[0];
			const filePath = match[1];
			const matchIndex = match.index ?? 0;
			const matchEnd = matchIndex + matchText.length;

			// Only process matches that overlap with the current line
			// Skip if match is entirely in previous line or entirely in next line
			const currentLineStart = currentLineOffset;
			const currentLineEnd = currentLineOffset + lineLength;

			if (matchEnd <= currentLineStart || matchIndex >= currentLineEnd) {
				// Match doesn't touch current line, skip it
				continue;
			}

			// Skip URLs
			if (
				matchText.startsWith("http://") ||
				matchText.startsWith("https://") ||
				matchText.startsWith("ftp://") ||
				(matchIndex > 0 &&
					combinedText[matchIndex - 1] === ":" &&
					(matchText.startsWith("//") || matchText.startsWith("http")))
			) {
				continue;
			}

			// Skip version strings (v1.2.3 format)
			if (/^v?\d+\.\d+(\.\d+)*$/.test(filePath)) {
				continue;
			}

			// Skip npm package references (@version context)
			const contextStart = Math.max(0, matchIndex - 30);
			const contextEnd = matchIndex + matchText.length;
			const context = combinedText.substring(contextStart, contextEnd);
			if (/@\d+\.\d+/.test(context)) {
				continue;
			}

			// Skip pure numbers
			if (/^\d+(:\d+)*$/.test(matchText)) {
				continue;
			}

			// Calculate the link range across potentially multiple lines
			const range = this.calculateLinkRange(
				matchIndex,
				matchEnd,
				prevLineLength,
				lineLength,
				bufferLineNumber,
				isCurrentLineWrapped,
				nextLineIsWrapped,
			);

			links.push({
				range,
				text: matchText,
				activate: (event: MouseEvent, text: string) => {
					this.handleActivation(event, text);
				},
			});
		}

		callback(links.length > 0 ? links : undefined);
	}

	private calculateLinkRange(
		matchIndex: number,
		matchEnd: number,
		prevLineLength: number,
		lineLength: number,
		bufferLineNumber: number,
		isCurrentLineWrapped: boolean,
		nextLineIsWrapped: boolean,
	): ILink["range"] {
		const currentLineStart = prevLineLength;
		const currentLineEnd = prevLineLength + lineLength;

		// Determine which lines the match spans
		const startsInPrevLine =
			isCurrentLineWrapped && matchIndex < currentLineStart;
		const endsInNextLine = nextLineIsWrapped && matchEnd > currentLineEnd;

		let startY: number;
		let startX: number;
		let endY: number;
		let endX: number;

		if (startsInPrevLine) {
			// Match starts in previous line
			startY = bufferLineNumber - 1;
			startX = matchIndex + 1;
		} else {
			// Match starts in current line
			startY = bufferLineNumber;
			startX = matchIndex - currentLineStart + 1;
		}

		if (endsInNextLine) {
			// Match ends in next line
			endY = bufferLineNumber + 1;
			endX = matchEnd - currentLineEnd + 1;
		} else if (matchEnd <= currentLineStart) {
			// Match ends in previous line (shouldn't happen due to earlier filter)
			endY = bufferLineNumber - 1;
			endX = matchEnd + 1;
		} else {
			// Match ends in current line
			endY = bufferLineNumber;
			endX = matchEnd - currentLineStart + 1;
		}

		return {
			start: { x: startX, y: startY },
			end: { x: endX, y: endY },
		};
	}

	private handleActivation(event: MouseEvent, text: string): void {
		if (!event.metaKey && !event.ctrlKey) {
			return;
		}

		event.preventDefault();

		const parsed = parseLineColumnPath(text);

		if (!parsed.file) {
			return;
		}

		this.onOpen(event, parsed.file, parsed.line, parsed.column);
	}
}
