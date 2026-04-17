/*---------------------------------------------------------------------------------------------
 *  Adapted from VSCode's terminalWordLinkDetector.ts
 *  https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminalContrib/links/browser/terminalWordLinkDetector.ts
 *
 *  Lowest-priority link detector: splits terminal text into words and
 *  validates each against the filesystem. Unlike VSCode (which opens a
 *  workspace search), we directly open the file if it exists.
 *--------------------------------------------------------------------------------------------*/

import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";
import type { TerminalLinkResolver } from "./link-resolver";

const MAX_LINE_LENGTH = 2000;
const MAX_WORD_LINK_LENGTH = 100;

/**
 * Default word separators (matches VSCode's terminal.integrated.wordSeparators).
 * Includes powerline symbols (U+E0B0 to U+E0BF).
 */
const DEFAULT_WORD_SEPARATORS = " ()[]{}',\"`─''|";

function buildSeparatorRegex(separators: string): RegExp {
	let powerlineSymbols = "";
	for (let i = 0xe0b0; i <= 0xe0bf; i++) {
		powerlineSymbols += String.fromCharCode(i);
	}
	const escaped = separators.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`[${escaped}${powerlineSymbols}]`, "g");
}

interface WordLink {
	text: string;
	startIndex: number;
	endIndex: number;
}

/**
 * Word-based link detector. Splits terminal lines by word separators and
 * validates each word against the filesystem. Only words that resolve to
 * actual files become links.
 *
 * Registered as lowest priority — only runs if the primary file-path
 * and URL detectors found nothing for the line.
 */
export class WordLinkDetector implements ILinkProvider {
	private readonly _separatorRegex: RegExp;

	constructor(
		private readonly _terminal: Terminal,
		private readonly _resolver: TerminalLinkResolver,
		private readonly _onActivate?: (
			event: MouseEvent,
			resolvedPath: string,
		) => void,
	) {
		this._separatorRegex = buildSeparatorRegex(DEFAULT_WORD_SEPARATORS);
	}

	provideLinks(
		bufferLineNumber: number,
		callback: (links: ILink[] | undefined) => void,
	): void {
		this._provideLinks(bufferLineNumber).then(
			(links) => callback(links.length > 0 ? links : undefined),
			() => callback(undefined),
		);
	}

	private async _provideLinks(bufferLineNumber: number): Promise<ILink[]> {
		const buffer = this._terminal.buffer.active;
		const line = buffer.getLine(bufferLineNumber - 1);
		if (!line) return [];

		const text = line.translateToString(true);
		if (!text || text.length > MAX_LINE_LENGTH) return [];

		const words = this._parseWords(text);
		const links: ILink[] = [];

		for (const word of words) {
			if (!word.text || word.text.length > MAX_WORD_LINK_LENGTH) continue;

			// Strip trailing colon (common in "file.txt: error")
			let wordText = word.text;
			if (wordText.endsWith(":")) {
				wordText = wordText.slice(0, -1);
			}

			// Skip words that don't look like filenames (must contain a dot)
			if (!wordText.includes(".")) continue;

			// Skip URLs
			if (wordText.startsWith("http://") || wordText.startsWith("https://"))
				continue;

			const resolved = await this._resolver.resolveLink(wordText);
			if (!resolved) continue;

			links.push({
				range: {
					start: { x: word.startIndex + 1, y: bufferLineNumber },
					end: {
						x: word.startIndex + wordText.length + 1,
						y: bufferLineNumber,
					},
				},
				text: wordText,
				activate: (event: MouseEvent) => {
					this._onActivate?.(event, resolved.path);
				},
			});
		}

		return links;
	}

	private _parseWords(text: string): WordLink[] {
		const words: WordLink[] = [];
		const splitWords = text.split(this._separatorRegex);
		let runningIndex = 0;
		for (const word of splitWords) {
			words.push({
				text: word,
				startIndex: runningIndex,
				endIndex: runningIndex + word.length,
			});
			runningIndex += word.length + 1;
		}
		return words;
	}
}
