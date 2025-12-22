import type { Terminal } from "@xterm/xterm";
import { parseLineColumnPath } from "line-column-path";
import { type LinkMatch, MultiLineLinkProvider } from "./MultiLineLinkProvider";

export class FilePathLinkProvider extends MultiLineLinkProvider {
	private readonly FILE_PATH_PATTERN =
		/((?:~|\.{1,2})?\/[^\s:()]+|(?:\.?[a-zA-Z0-9_-]+\/)+[a-zA-Z0-9_\-.]+)(?::(\d+))?(?::(\d+))?/g;

	constructor(
		terminal: Terminal,
		private readonly onOpen: (
			event: MouseEvent,
			path: string,
			line?: number,
			column?: number,
		) => void,
	) {
		super(terminal);
	}

	protected getPattern(): RegExp {
		// Return a new instance to reset lastIndex for global regex
		return new RegExp(this.FILE_PATH_PATTERN.source, "g");
	}

	protected shouldSkipMatch(match: LinkMatch): boolean {
		const { text: matchText, index: matchIndex, combinedText, groups } = match;
		const filePath = groups[1];

		// Skip URLs
		if (
			matchText.startsWith("http://") ||
			matchText.startsWith("https://") ||
			matchText.startsWith("ftp://") ||
			(matchIndex > 0 &&
				combinedText[matchIndex - 1] === ":" &&
				(matchText.startsWith("//") || matchText.startsWith("http")))
		) {
			return true;
		}

		// Skip version strings (v1.2.3 format)
		if (/^v?\d+\.\d+(\.\d+)*$/.test(filePath)) {
			return true;
		}

		// Skip npm package references (@version context)
		const contextStart = Math.max(0, matchIndex - 30);
		const contextEnd = matchIndex + matchText.length;
		const context = combinedText.substring(contextStart, contextEnd);
		if (/@\d+\.\d+/.test(context)) {
			return true;
		}

		// Skip pure numbers
		if (/^\d+(:\d+)*$/.test(matchText)) {
			return true;
		}

		return false;
	}

	protected handleActivation(event: MouseEvent, text: string): void {
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
