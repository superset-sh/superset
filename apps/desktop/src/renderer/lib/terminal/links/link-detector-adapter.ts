/*---------------------------------------------------------------------------------------------
 *  Adapted from VSCode's terminalLinkDetectorAdapter.ts
 *  https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminalContrib/links/browser/terminalLinkDetectorAdapter.ts
 *
 *  Bridges LocalLinkDetector to xterm's ILinkProvider interface.
 *--------------------------------------------------------------------------------------------*/

import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";
import type { DetectedLink, LocalLinkDetector } from "./local-link-detector";

/**
 * Adapts a LocalLinkDetector into xterm's ILinkProvider.
 *
 * When xterm calls `provideLinks(bufferLineNumber)`, this adapter:
 * 1. Extracts the text for that line (plus any wrapped context)
 * 2. Delegates to LocalLinkDetector.detect()
 * 3. Converts DetectedLink[] to xterm ILink[] with proper buffer ranges
 */
export class LinkDetectorAdapter implements ILinkProvider {
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
		this._provideLinks(bufferLineNumber).then(
			(links) => callback(links.length > 0 ? links : undefined),
			() => callback(undefined),
		);
	}

	private async _provideLinks(bufferLineNumber: number): Promise<ILink[]> {
		const lineIndex = bufferLineNumber - 1;
		const buffer = this._terminal.buffer.active;
		const line = buffer.getLine(lineIndex);
		if (!line) {
			return [];
		}

		// Gather text: current line (plus wrapped context like VSCode does)
		const text = line.translateToString(true);
		if (!text) {
			return [];
		}

		const detectedLinks = await this._detector.detect(text);
		const links: ILink[] = [];

		for (const detected of detectedLinks) {
			const range = {
				start: {
					x: detected.startIndex + 1, // 1-based
					y: bufferLineNumber,
				},
				end: {
					x: detected.endIndex,
					y: bufferLineNumber,
				},
			};

			links.push({
				range,
				text: detected.text,
				activate: (event: MouseEvent) => {
					this._onActivate?.(event, detected);
				},
			});
		}

		return links;
	}
}
