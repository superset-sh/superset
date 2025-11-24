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
		const line = this.terminal.buffer.active.getLine(bufferLineNumber - 1);
		if (!line) {
			callback(undefined);
			return;
		}

		const lineText = line.translateToString(true);
		const links: ILink[] = [];

		const regex = new RegExp(this.FILE_PATH_PATTERN, "g");

		for (const match of lineText.matchAll(regex)) {
			const matchText = match[0];
			const filePath = match[1];

			const matchIndex = match.index ?? 0;
			if (
				matchText.startsWith("http://") ||
				matchText.startsWith("https://") ||
				matchText.startsWith("ftp://") ||
				(matchIndex > 0 &&
					lineText[matchIndex - 1] === ":" &&
					(matchText.startsWith("//") || matchText.startsWith("http")))
			) {
				continue;
			}

			if (/^v?\d+\.\d+(\.\d+)*$/.test(filePath)) {
				continue;
			}

			const contextStart = Math.max(0, matchIndex - 30);
			const contextEnd = matchIndex + matchText.length;
			const context = lineText.substring(contextStart, contextEnd);
			if (/@\d+\.\d+/.test(context)) {
				continue;
			}

			if (/^\d+(:\d+)*$/.test(matchText)) {
				continue;
			}

			const startColumn = matchIndex + 1;
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
				dispose: () => {},
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
