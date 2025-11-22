import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";
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
	// Note: No 'g' flag - we create a new regex for matchAll() each time to avoid state issues
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
		const line = this.terminal.buffer.active.getLine(bufferLineNumber - 1);
		if (!line) {
			callback(undefined);
			return;
		}

		const lineText = line.translateToString(true);
		const links: ILink[] = [];

		// Create a new regex with 'g' flag for each call to avoid state corruption
		const regex = new RegExp(this.FILE_PATH_PATTERN, "g");

		// Use matchAll for cleaner iteration without manual state management
		for (const match of lineText.matchAll(regex)) {
			const matchText = match[0];

			// Skip if it looks like a URL or doesn't look like a file path
			const filePath = match[1];
			if (
				filePath.startsWith("http://") ||
				filePath.startsWith("https://") ||
				filePath.startsWith("ftp://")
			) {
				continue;
			}

			// Skip version numbers (e.g., "1.2.3", "v1.2.3")
			// These have multiple dots but no slashes
			if (/^v?\d+\.\d+(\.\d+)*$/.test(filePath)) {
				continue;
			}

			// Skip npm package references (e.g., "package@1.0.0/dist/file.js")
			// These contain @ followed by version numbers
			if (/@\d+\.\d+/.test(filePath)) {
				continue;
			}

			// Skip if it's just a number with colons (e.g., "12:34:56" from timestamps)
			if (/^\d+(:\d+)*$/.test(matchText)) {
				continue;
			}

			// xterm uses 1-indexed coordinates
			const startColumn = (match.index ?? 0) + 1;
			const endColumn = startColumn + matchText.length;

			links.push({
				range: {
					start: { x: startColumn, y: bufferLineNumber },
					end: { x: endColumn, y: bufferLineNumber },
				},
				text: matchText,
				activate: (event: MouseEvent, text: string) => {
					this.handleActivation(event, text);
				},
				hover: (event: MouseEvent, text: string) => {
					this.handleHover(event, text);
				},
				leave: (event: MouseEvent, text: string) => {
					this.handleLeave(event, text);
				},
				dispose: () => {
					// No cleanup needed
				},
			});
		}

		callback(links.length > 0 ? links : undefined);
	}

	handleHover(_event: MouseEvent, _text: string): void {
		if (this.terminal.element) {
			this.terminal.element.style.cursor = "pointer";
		}
	}

	handleLeave(_event: MouseEvent, _text: string): void {
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
