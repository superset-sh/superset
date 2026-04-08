/*---------------------------------------------------------------------------------------------
 *  Adapted from VSCode's terminalLinkDetectorAdapter.ts
 *  https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminalContrib/links/browser/terminalLinkDetectorAdapter.ts
 *
 *  Bridges LocalLinkDetector to xterm's ILinkProvider interface.
 *  Handles multi-line wrapped paths by gathering context lines.
 *  Deduplicates in-flight requests per buffer line (VSCode pattern).
 *--------------------------------------------------------------------------------------------*/

import type { IBufferLine, ILink, ILinkProvider, Terminal } from "@xterm/xterm";
import {
	convertLinkRangeToBuffer,
	getXtermLineContent,
} from "./buffer-helpers";
import type { DetectedLink, LocalLinkDetector } from "./local-link-detector";

/** Maximum characters of context to gather around the hovered line. */
const MAX_LINK_LENGTH = 500;

/**
 * Adapts a LocalLinkDetector into xterm's ILinkProvider.
 *
 * When xterm calls `provideLinks(bufferLineNumber)`, this adapter:
 * 1. Deduplicates in-flight requests for the same line
 * 2. Gathers wrapped context lines (previous + current + next)
 * 3. Concatenates them into a single text block
 * 4. Delegates to LocalLinkDetector.detect()
 * 5. Maps detected ranges back to buffer coordinates using
 *    convertLinkRangeToBuffer (handles wide chars correctly)
 */
export class LinkDetectorAdapter implements ILinkProvider {
	/**
	 * Cache of in-flight link detection requests per buffer line.
	 * Prevents duplicate async work when xterm requests the same line
	 * multiple times during rapid mouse movement (VSCode pattern).
	 */
	private _activeRequests = new Map<number, Promise<ILink[]>>();

	constructor(
		private readonly _terminal: Terminal,
		private readonly _detector: LocalLinkDetector,
		private readonly _onActivate?: (
			event: MouseEvent,
			link: DetectedLink,
		) => void,
	) {}

	provideLinks(
		bufferLineNumber: number,
		callback: (links: ILink[] | undefined) => void,
	): void {
		// Reuse in-flight request for this line if one exists
		let request = this._activeRequests.get(bufferLineNumber);
		if (!request) {
			request = this._provideLinks(bufferLineNumber);
			this._activeRequests.set(bufferLineNumber, request);
		}
		request.then(
			(links) => {
				this._activeRequests.delete(bufferLineNumber);
				callback(links.length > 0 ? links : undefined);
			},
			() => {
				this._activeRequests.delete(bufferLineNumber);
				callback(undefined);
			},
		);
	}

	private async _provideLinks(bufferLineNumber: number): Promise<ILink[]> {
		const buffer = this._terminal.buffer.active;
		const cols = this._terminal.cols;

		// Gather wrapped context lines around the target line.
		// VSCode caps context to maxLinkLength chars on either side.
		let startLine = bufferLineNumber - 1;
		let endLine = startLine;

		const lines: IBufferLine[] = [];
		const currentLine = buffer.getLine(startLine);
		if (!currentLine) return [];
		lines.push(currentLine);

		const maxLineContext = Math.ceil(Math.max(MAX_LINK_LENGTH, cols) / cols);
		const minStartLine = Math.max(startLine - maxLineContext, 0);
		const maxEndLine = Math.min(endLine + maxLineContext, buffer.length - 1);

		// Walk backward through wrapped lines
		while (startLine > minStartLine && buffer.getLine(startLine)?.isWrapped) {
			const prevLine = buffer.getLine(startLine - 1);
			if (!prevLine) break;
			lines.unshift(prevLine);
			startLine--;
		}

		// Walk forward through wrapped lines
		while (endLine < maxEndLine && buffer.getLine(endLine + 1)?.isWrapped) {
			const nextLine = buffer.getLine(endLine + 1);
			if (!nextLine) break;
			lines.push(nextLine);
			endLine++;
		}

		// Concatenate all gathered lines into one text block
		const text = getXtermLineContent(buffer, startLine, endLine, cols);
		if (!text) return [];

		const detectedLinks = await this._detector.detect(text);
		const result: ILink[] = [];

		for (const detected of detectedLinks) {
			// Convert text offsets to buffer range, accounting for wide chars
			const range = convertLinkRangeToBuffer(
				lines,
				cols,
				{
					startColumn: detected.startIndex + 1, // 1-based
					startLineNumber: 1,
					endColumn: detected.endIndex + 1,
					endLineNumber: 1,
				},
				startLine,
			);

			// Only include links that overlap with the requested line
			const requestedLineY = bufferLineNumber;
			if (range.end.y < requestedLineY || range.start.y > requestedLineY) {
				continue;
			}

			result.push({
				range,
				text: detected.text,
				activate: (event: MouseEvent) => {
					this._onActivate?.(event, detected);
				},
			});
		}

		return result;
	}
}
