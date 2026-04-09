/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  Adapted from VSCode's terminalLinkHelpers.ts
 *  https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminalContrib/links/browser/terminalLinkHelpers.ts
 *--------------------------------------------------------------------------------------------*/

import type { IBuffer, IBufferLine, IBufferRange } from "@xterm/xterm";

/**
 * A simplified IRange representation (1-based columns, 1-based lines) matching
 * the shape VSCode feeds into convertLinkRangeToBuffer.
 */
export interface IRange {
	startColumn: number;
	startLineNumber: number;
	endColumn: number;
	endLineNumber: number;
}

/**
 * Convert a text-offset range (IRange) into a buffer-cell range (IBufferRange),
 * correctly accounting for wide characters (CJK, emoji) that occupy 2 cells but
 * only 1 logical character position.
 *
 * This is ported directly from VSCode to fix a class of bugs where the
 * highlighted link range is shifted when wide characters appear on the same
 * line.
 */
export function convertLinkRangeToBuffer(
	lines: IBufferLine[],
	bufferWidth: number,
	range: IRange,
	startLine: number,
): IBufferRange {
	const bufferRange: IBufferRange = {
		start: {
			x: range.startColumn,
			y: range.startLineNumber + startLine,
		},
		end: {
			x: range.endColumn - 1,
			y: range.endLineNumber + startLine,
		},
	};

	// Calculate start offset caused by wide chars before the start column
	let startOffset = 0;
	const startWrappedLineCount = Math.ceil(range.startColumn / bufferWidth);
	for (let y = 0; y < Math.min(startWrappedLineCount); y++) {
		const lineLength = Math.min(
			bufferWidth,
			range.startColumn - 1 - y * bufferWidth,
		);
		let lineOffset = 0;
		const line = lines[y];
		if (!line) {
			break;
		}
		for (let x = 0; x < Math.min(bufferWidth, lineLength + lineOffset); x++) {
			const cell = line.getCell(x);
			if (!cell) {
				break;
			}
			const width = cell.getWidth();
			if (width === 2) {
				lineOffset++;
			}
			const char = cell.getChars();
			if (char.length > 1) {
				lineOffset -= char.length - 1;
			}
		}
		startOffset += lineOffset;
	}

	// Calculate end offset caused by wide chars between start and end columns
	let endOffset = 0;
	const endWrappedLineCount = Math.ceil(range.endColumn / bufferWidth);
	for (
		let y = Math.max(0, startWrappedLineCount - 1);
		y < endWrappedLineCount;
		y++
	) {
		const start =
			y === startWrappedLineCount - 1
				? (range.startColumn - 1 + startOffset) % bufferWidth
				: 0;
		const lineLength = Math.min(
			bufferWidth,
			range.endColumn + startOffset - y * bufferWidth,
		);
		let lineOffset = 0;
		const line = lines[y];
		if (!line) {
			break;
		}
		for (
			let x = start;
			x < Math.min(bufferWidth, lineLength + lineOffset);
			x++
		) {
			const cell = line.getCell(x);
			if (!cell) {
				break;
			}
			const width = cell.getWidth();
			const chars = cell.getChars();
			if (width === 2) {
				lineOffset++;
			}
			// A wide character that can't fit at the last column causes xterm to
			// place an empty marker cell (width=1, chars="") there and wrap the
			// char to the next line. A normal padding cell (the 2nd half of a
			// wide char that DID fit) has width=0 and should NOT trigger an
			// extra offset. VSCode's original code only checks `chars === ""`
			// which is overly broad; we add a width check to avoid false
			// positives when a wide char's padding cell lands on the last column.
			if (x === bufferWidth - 1 && chars === "" && cell.getWidth() !== 0) {
				lineOffset++;
			}
			if (chars.length > 1) {
				lineOffset -= chars.length - 1;
			}
		}
		endOffset += lineOffset;
	}

	bufferRange.start.x += startOffset;
	bufferRange.end.x += startOffset + endOffset;

	// Wrap x values that overflow a line into the next line
	while (bufferRange.start.x > bufferWidth) {
		bufferRange.start.x -= bufferWidth;
		bufferRange.start.y++;
	}
	while (bufferRange.end.x > bufferWidth) {
		bufferRange.end.x -= bufferWidth;
		bufferRange.end.y++;
	}

	return bufferRange;
}

/**
 * Split terminal lines by text attributes (bold, underline, italic, etc.).
 * Returns buffer ranges where each range has consistent styling.
 *
 * Used as a last-resort fallback for link detection: if a filename is printed
 * with different styling (e.g. bold or underlined) than surrounding text,
 * each styled segment can be tested as a potential file path.
 *
 * Vendored from VSCode's terminalLinkHelpers.ts.
 */
export function getXtermRangesByAttr(
	buffer: IBuffer,
	lineStart: number,
	lineEnd: number,
	cols: number,
): IBufferRange[] {
	let bufferRangeStart: { x: number; y: number } | undefined;
	let lastFgAttr = -1;
	let lastBgAttr = -1;
	const ranges: IBufferRange[] = [];
	for (let y = lineStart; y <= lineEnd; y++) {
		const line = buffer.getLine(y);
		if (!line) {
			continue;
		}
		for (let x = 0; x < cols; x++) {
			const cell = line.getCell(x);
			if (!cell) {
				break;
			}
			// Re-construct the attributes from fg and bg. This relies on
			// xterm's internal buffer bit layout (same approach as VSCode).
			const thisFgAttr =
				cell.isBold() |
				cell.isInverse() |
				cell.isStrikethrough() |
				cell.isUnderline();
			const thisBgAttr = cell.isDim() | cell.isItalic();
			if (lastFgAttr === -1 || lastBgAttr === -1) {
				bufferRangeStart = { x, y };
			} else {
				if (lastFgAttr !== thisFgAttr || lastBgAttr !== thisBgAttr) {
					if (bufferRangeStart) {
						ranges.push({
							start: bufferRangeStart,
							end: { x, y },
						});
					}
					bufferRangeStart = { x, y };
				}
			}
			lastFgAttr = thisFgAttr;
			lastBgAttr = thisBgAttr;
		}
	}
	return ranges;
}

/**
 * Extract the text content from a range of terminal buffer lines.
 * Caps the maximum read length to prevent excessive reads on very long output.
 */
export function getXtermLineContent(
	buffer: IBuffer,
	lineStart: number,
	lineEnd: number,
	cols: number,
): string {
	const maxLineLength = Math.max(2048, cols * 2);
	const cappedEnd = Math.min(lineEnd, lineStart + maxLineLength);
	let content = "";
	for (let i = lineStart; i <= cappedEnd; i++) {
		const line = buffer.getLine(i);
		if (line) {
			content += line.translateToString(true, 0, cols);
		}
	}
	return content;
}
