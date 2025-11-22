import type { ILinkProvider, IViewportRange, Terminal } from "@xterm/xterm";
import { parseLineColumnPath } from "line-column-path";

/**
 * Custom link provider for detecting file paths in terminal output
 * Uses line-column-path library for robust parsing of file paths with line/column numbers
 * Matches patterns like:
 * - /absolute/path/to/file.ts
 * - ./relative/path/file.ts
 * - src/components/App.tsx:45
 * - src/components/App.tsx:45:12
 * - /path/to/directory
 * - .superset/navy-meadow-16
 * - at Object.<anonymous> (/path/to/file.js:10:15)
 */
export class FilePathLinkProvider implements ILinkProvider {
	// Broad regex to find potential file path-like strings
	// We use line-column-path library for actual parsing
	private readonly FILE_PATH_REGEX =
		/((?:~|\.{1,2})?\/[^\s:()]+|(?:\.?[a-zA-Z0-9_-]+\/)+[a-zA-Z0-9_\-.]+)(?::(\d+))?(?::(\d+))?/g;

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
		callback: (
			links: Array<{ range: IViewportRange; text: string }> | undefined,
		) => void,
	): void {
		const line = this.terminal.buffer.active.getLine(bufferLineNumber - 1);
		if (!line) {
			callback(undefined);
			return;
		}

		const lineText = line.translateToString(true);
		const links: Array<{ range: IViewportRange; text: string }> = [];

		this.FILE_PATH_REGEX.lastIndex = 0;

		let match = this.FILE_PATH_REGEX.exec(lineText);
		while (match !== null) {
			const matchText = match[0];
			const filePath = match[1];
			const _lineNumber = match[2] ? Number.parseInt(match[2], 10) : undefined;
			const _columnNumber = match[3]
				? Number.parseInt(match[3], 10)
				: undefined;

			// Skip if it looks like a URL or doesn't look like a file path
			if (
				filePath.startsWith("http://") ||
				filePath.startsWith("https://") ||
				filePath.startsWith("ftp://")
			) {
				continue;
			}

			// Create viewport range for the match
			const startColumn = match.index + 1; // 1-indexed
			const endColumn = startColumn + matchText.length;

			links.push({
				range: {
					start: { x: startColumn, y: bufferLineNumber },
					end: { x: endColumn, y: bufferLineNumber },
				},
				text: matchText,
			});

			match = this.FILE_PATH_REGEX.exec(lineText);
		}

		callback(links.length > 0 ? links : undefined);
	}

	handleHover(_event: MouseEvent, _text: string): void {
		// Change cursor to pointer on hover
		if (this.terminal.element) {
			this.terminal.element.style.cursor = "pointer";
		}
	}

	handleLeave(_event: MouseEvent, _text: string): void {
		// Reset cursor when leaving
		if (this.terminal.element) {
			this.terminal.element.style.cursor = "default";
		}
	}

	handleActivation(event: MouseEvent, text: string): void {
		// Only activate on Cmd+Click (macOS) or Ctrl+Click (Windows/Linux)
		if (!event.metaKey && !event.ctrlKey) {
			return;
		}

		event.preventDefault();

		// Use line-column-path library for robust parsing
		const parsed = parseLineColumnPath(text);

		if (!parsed.file) {
			return;
		}

		this.onOpen(event, parsed.file, parsed.line, parsed.column);
	}
}
