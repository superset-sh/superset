import type { Terminal } from "@xterm/xterm";
import { parseLineColumnPath } from "line-column-path";
import {
	type LinkMatch,
	MultiLineLinkProvider,
} from "./multi-line-link-provider";

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
		return new RegExp(this.FILE_PATH_PATTERN.source, "g");
	}

	protected shouldSkipMatch(match: LinkMatch): boolean {
		const {
			text: matchText,
			index: matchIndex,
			combinedText,
			regexMatch,
		} = match;
		const filePath = regexMatch[1];

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

		if (/^v?\d+\.\d+(\.\d+)*$/.test(filePath)) {
			return true;
		}

		const contextStart = Math.max(0, matchIndex - 30);
		const contextEnd = matchIndex + matchText.length;
		const context = combinedText.substring(contextStart, contextEnd);
		if (/@\d+\.\d+/.test(context)) {
			return true;
		}

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
