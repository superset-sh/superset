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
	getXtermRangesByAttr,
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
 * 5. If no links found, tries styled-text detection (getXtermRangesByAttr)
 * 6. Maps detected ranges back to buffer coordinates using
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
		private readonly _onHover?: (event: MouseEvent, link: DetectedLink) => void,
		private readonly _onLeave?: () => void,
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

		const maxCharacterContext = Math.max(MAX_LINK_LENGTH, cols);
		const maxLineContext = Math.ceil(maxCharacterContext / cols);
		const minStartLine = Math.max(startLine - maxLineContext, 0);
		const maxEndLine = Math.min(endLine + maxLineContext, buffer.length);

		// Walk backward through wrapped lines
		while (startLine >= minStartLine && buffer.getLine(startLine)?.isWrapped) {
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
		let result = this._mapDetectedLinks(
			detectedLinks,
			lines,
			cols,
			startLine,
			bufferLineNumber,
		);

		// VENDORED FROM VSCODE (terminalLocalLinkDetector.ts lines 220-252):
		// Styled-text fallback — if no links found, split lines by terminal
		// attributes (bold/underline/italic) and try each styled segment as
		// a file path. Catches filenames that the app printed with styling.
		// To disable: remove or comment out this block.
		if (result.length === 0) {
			result = await this._detectStyledTextLinks(
				startLine,
				endLine,
				bufferLineNumber,
			);
		}

		return result;
	}

	/**
	 * Styled-text fallback: split lines by terminal attributes and try each
	 * segment as a file path. Vendored from VSCode's TerminalLocalLinkDetector.
	 */
	private async _detectStyledTextLinks(
		startLine: number,
		endLine: number,
		bufferLineNumber: number,
	): Promise<ILink[]> {
		const buffer = this._terminal.buffer.active;
		const cols = this._terminal.cols;
		const result: ILink[] = [];

		const rangeCandidates = getXtermRangesByAttr(
			buffer,
			startLine,
			endLine,
			cols,
		);

		for (const rangeCandidate of rangeCandidates) {
			let text = "";
			for (let y = rangeCandidate.start.y; y <= rangeCandidate.end.y; y++) {
				const line = buffer.getLine(y);
				if (!line) break;
				const lineStartX =
					y === rangeCandidate.start.y ? rangeCandidate.start.x : 0;
				const lineEndX =
					y === rangeCandidate.end.y ? rangeCandidate.end.x : cols - 1;
				text += line.translateToString(false, lineStartX, lineEndX);
			}

			if (!text.trim()) continue;

			// Adjust to 1-based for xterm link API (matches VSCode's HACK comment)
			const range = {
				start: {
					x: rangeCandidate.start.x + 1,
					y: rangeCandidate.start.y + 1,
				},
				end: {
					x: rangeCandidate.end.x,
					y: rangeCandidate.end.y + 1,
				},
			};

			// Only include if overlaps with requested line
			if (range.end.y < bufferLineNumber || range.start.y > bufferLineNumber) {
				continue;
			}

			const detectedLinks = await this._detector.detect(text.trim());
			for (const detected of detectedLinks) {
				result.push({
					range,
					text: detected.text,
					activate: (event: MouseEvent) => {
						this._onActivate?.(event, detected);
					},
					hover: (event: MouseEvent) => {
						this._onHover?.(event, detected);
					},
					leave: () => {
						this._onLeave?.();
					},
				});
			}
		}

		return result;
	}

	private _mapDetectedLinks(
		detectedLinks: DetectedLink[],
		lines: IBufferLine[],
		cols: number,
		startLine: number,
		bufferLineNumber: number,
	): ILink[] {
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
			if (range.end.y < bufferLineNumber || range.start.y > bufferLineNumber) {
				continue;
			}

			result.push({
				range,
				text: detected.text,
				activate: (event: MouseEvent) => {
					this._onActivate?.(event, detected);
				},
				hover: (event: MouseEvent) => {
					this._onHover?.(event, detected);
				},
				leave: () => {
					this._onLeave?.();
				},
			});
		}

		return result;
	}
}
