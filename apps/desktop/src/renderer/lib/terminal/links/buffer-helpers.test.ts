/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *
 *  Adapted from VSCode's terminalLinkHelpers.test.ts
 *  https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminalContrib/links/test/browser/terminalLinkHelpers.test.ts
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from "bun:test";
import type { IBufferLine } from "@xterm/xterm";
import {
	convertLinkRangeToBuffer,
	getXtermLineContent,
} from "./buffer-helpers";

/**
 * Create a mock IBufferLine from a descriptor.
 * `text` is the logical string content; `width` is the number of terminal
 * columns the line occupies (may differ from text.length when wide/emoji chars
 * are present).
 */
function createMockBufferLine(descriptor: {
	text: string;
	width: number;
}): IBufferLine {
	const { text, width } = descriptor;

	// Pre-compute per-cell data: iterate the text once.
	// Wide characters occupy 2 cells; the second cell has an empty char and
	// width 0. Multi-codepoint characters (e.g. emoji composed of several
	// code-units) report their full string as `getChars()`.
	const cells: { chars: string; width: number }[] = [];
	for (const char of text) {
		const codePoint = char.codePointAt(0) ?? 0;
		// Simple wide-char heuristic: CJK Unified Ideographs + some common ranges
		const isWide =
			(codePoint >= 0x1100 &&
				(codePoint <= 0x115f || // Hangul Jamo
					codePoint === 0x2329 ||
					codePoint === 0x232a ||
					(codePoint >= 0x2e80 && codePoint <= 0x3247) ||
					(codePoint >= 0x3250 && codePoint <= 0x4dbf) ||
					(codePoint >= 0x4e00 && codePoint <= 0xa4c6) ||
					(codePoint >= 0xa960 && codePoint <= 0xa97c) ||
					(codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
					(codePoint >= 0xf900 && codePoint <= 0xfaff) ||
					(codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
					(codePoint >= 0xfe30 && codePoint <= 0xfe6b) ||
					(codePoint >= 0xff01 && codePoint <= 0xff60) ||
					(codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
					(codePoint >= 0x1f000 && codePoint <= 0x1fbff) ||
					(codePoint >= 0x20000 && codePoint <= 0x2fffd) ||
					(codePoint >= 0x30000 && codePoint <= 0x3fffd))) ||
			// Emoji modifiers and common emoji ranges
			(codePoint >= 0x1f300 && codePoint <= 0x1f9ff);

		if (isWide) {
			cells.push({ chars: char, width: 2 });
			// Wide chars occupy a second cell with empty content
			cells.push({ chars: "", width: 0 });
		} else {
			cells.push({ chars: char, width: 1 });
		}
	}

	// Pad remaining cells to `width` with empty space cells
	while (cells.length < width) {
		cells.push({ chars: " ", width: 1 });
	}

	return {
		length: width,
		isWrapped: false,
		getCell(x: number) {
			const cell = cells[x];
			if (!cell) return undefined as never;
			return {
				getChars: () => cell.chars,
				getWidth: () => cell.width,
				getCode: () => cell.chars.codePointAt(0) ?? 0,
				isBold: () => 0,
				isDim: () => 0,
				isInverse: () => 0,
				isItalic: () => 0,
				isStrikethrough: () => 0,
				isUnderline: () => 0,
				isBlink: () => 0,
				isInvisible: () => 0,
				isOverline: () => 0,
				isAttributeDefault: () => false,
				getFgColorMode: () => 0,
				getBgColorMode: () => 0,
				getFgColor: () => 0,
				getBgColor: () => 0,
			} as never;
		},
		translateToString(
			trimRight?: boolean,
			startColumn?: number,
			endColumn?: number,
		) {
			const start = startColumn ?? 0;
			const end = endColumn ?? width;
			let result = "";
			for (let i = start; i < end && i < cells.length; i++) {
				const c = cells[i];
				if (c?.chars) {
					result += c.chars;
				}
			}
			if (trimRight) {
				result = result.replace(/\s+$/, "");
			}
			return result;
		},
	} as unknown as IBufferLine;
}

function createBufferLineArray(
	descriptors: { text: string; width: number }[],
): IBufferLine[] {
	return descriptors.map(createMockBufferLine);
}

describe("buffer-helpers", () => {
	describe("convertLinkRangeToBuffer", () => {
		it("should convert ranges for ascii characters", () => {
			const lines = createBufferLineArray([
				{ text: "AA http://t", width: 11 },
				{ text: ".com/f/", width: 8 },
			]);
			const result = convertLinkRangeToBuffer(
				lines,
				11,
				{
					startColumn: 4,
					startLineNumber: 1,
					endColumn: 19,
					endLineNumber: 1,
				},
				0,
			);
			expect(result).toEqual({
				start: { x: 4, y: 1 },
				end: { x: 7, y: 2 },
			});
		});

		it("should convert ranges for wide characters before the link", () => {
			const lines = createBufferLineArray([
				{ text: "A文 http://", width: 11 },
				{ text: "t.com/f/", width: 9 },
			]);
			const result = convertLinkRangeToBuffer(
				lines,
				11,
				{
					startColumn: 4,
					startLineNumber: 1,
					endColumn: 19,
					endLineNumber: 1,
				},
				0,
			);
			expect(result).toEqual({
				start: { x: 4 + 1, y: 1 },
				end: { x: 7 + 1, y: 2 },
			});
		});

		it("should give correct range for links containing multi-character emoji", () => {
			const lines = createBufferLineArray([{ text: "A🙂 http://", width: 11 }]);
			const result = convertLinkRangeToBuffer(
				lines,
				11,
				{
					startColumn: 0 + 1,
					startLineNumber: 1,
					endColumn: 2 + 1,
					endLineNumber: 1,
				},
				0,
			);
			expect(result).toEqual({
				start: { x: 1, y: 1 },
				end: { x: 2, y: 1 },
			});
		});

		// Note: In a real xterm buffer, 🙂 (U+1F642) is a supplementary character
		// that takes 2 JS string positions (surrogate pair) AND 2 buffer cells.
		// The algorithm correctly nets to 0 offset for emoji (width +1, chars.length -1).
		// This differs from CJK (BMP) chars which take 1 JS position but 2 cells (+1 offset).
		it("should convert ranges for emoji characters before the link", () => {
			const lines = createBufferLineArray([
				{ text: "A🙂 http://", width: 11 },
				{ text: "t.com/f/", width: 9 },
			]);
			const result = convertLinkRangeToBuffer(
				lines,
				11,
				{
					startColumn: 4 + 1,
					startLineNumber: 1,
					endColumn: 19 + 1,
					endLineNumber: 1,
				},
				0,
			);
			// Emoji offset is 0: the surrogate pair occupies 2 text positions
			// matching the 2 buffer cells, so no adjustment needed.
			expect(result).toEqual({
				start: { x: 5, y: 1 },
				end: { x: 8, y: 2 },
			});
		});

		it("should convert ranges for wide characters inside the link", () => {
			const lines = createBufferLineArray([
				{ text: "AA http://t", width: 11 },
				{ text: ".com/文/", width: 8 },
			]);
			const result = convertLinkRangeToBuffer(
				lines,
				11,
				{
					startColumn: 4,
					startLineNumber: 1,
					endColumn: 19,
					endLineNumber: 1,
				},
				0,
			);
			expect(result).toEqual({
				start: { x: 4, y: 1 },
				end: { x: 7 + 1, y: 2 },
			});
		});

		it("should convert ranges for wide characters before and inside the link", () => {
			const lines = createBufferLineArray([
				{ text: "A文 http://", width: 11 },
				{ text: "t.com/文/", width: 9 },
			]);
			const result = convertLinkRangeToBuffer(
				lines,
				11,
				{
					startColumn: 4,
					startLineNumber: 1,
					endColumn: 19,
					endLineNumber: 1,
				},
				0,
			);
			expect(result).toEqual({
				start: { x: 4 + 1, y: 1 },
				end: { x: 7 + 2, y: 2 },
			});
		});

		it("should convert ranges for emoji before and wide inside the link", () => {
			const lines = createBufferLineArray([
				{ text: "A🙂 http://", width: 11 },
				{ text: "t.com/文/", width: 9 },
			]);
			const result = convertLinkRangeToBuffer(
				lines,
				11,
				{
					startColumn: 4 + 1,
					startLineNumber: 1,
					endColumn: 19 + 1,
					endLineNumber: 1,
				},
				0,
			);
			// Emoji before: 0 offset. CJK inside link: +1 offset.
			expect(result).toEqual({
				start: { x: 5, y: 1 },
				end: { x: 9, y: 2 },
			});
		});

		it("should convert ranges for ascii characters (link starts on wrapped line)", () => {
			const lines = createBufferLineArray([
				{ text: "AAAAAAAAAAA", width: 11 },
				{ text: "AA http://t", width: 11 },
				{ text: ".com/f/", width: 8 },
			]);
			const result = convertLinkRangeToBuffer(
				lines,
				11,
				{
					startColumn: 15,
					startLineNumber: 1,
					endColumn: 30,
					endLineNumber: 1,
				},
				0,
			);
			expect(result).toEqual({
				start: { x: 4, y: 2 },
				end: { x: 7, y: 3 },
			});
		});

		it("should convert ranges for wide characters before the link (link starts on wrapped line)", () => {
			const lines = createBufferLineArray([
				{ text: "AAAAAAAAAAA", width: 11 },
				{ text: "A文 http://", width: 11 },
				{ text: "t.com/f/", width: 9 },
			]);
			const result = convertLinkRangeToBuffer(
				lines,
				11,
				{
					startColumn: 15,
					startLineNumber: 1,
					endColumn: 30,
					endLineNumber: 1,
				},
				0,
			);
			expect(result).toEqual({
				start: { x: 4 + 1, y: 2 },
				end: { x: 7 + 1, y: 3 },
			});
		});

		it("regression test #147619: CJK text with numbers", () => {
			const lines = createBufferLineArray([
				{ text: "获取模板 25235168 的预览图失败", width: 30 },
			]);
			expect(
				convertLinkRangeToBuffer(
					lines,
					30,
					{
						startColumn: 1,
						startLineNumber: 1,
						endColumn: 5,
						endLineNumber: 1,
					},
					0,
				),
			).toEqual({
				start: { x: 1, y: 1 },
				end: { x: 8, y: 1 },
			});
			expect(
				convertLinkRangeToBuffer(
					lines,
					30,
					{
						startColumn: 6,
						startLineNumber: 1,
						endColumn: 14,
						endLineNumber: 1,
					},
					0,
				),
			).toEqual({
				start: { x: 10, y: 1 },
				end: { x: 17, y: 1 },
			});
			expect(
				convertLinkRangeToBuffer(
					lines,
					30,
					{
						startColumn: 15,
						startLineNumber: 1,
						endColumn: 21,
						endLineNumber: 1,
					},
					0,
				),
			).toEqual({
				start: { x: 19, y: 1 },
				end: { x: 30, y: 1 },
			});
		});

		it("should convert ranges for wide characters inside the link (link starts on wrapped line)", () => {
			const lines = createBufferLineArray([
				{ text: "AAAAAAAAAAA", width: 11 },
				{ text: "AA http://t", width: 11 },
				{ text: ".com/文/", width: 8 },
			]);
			const result = convertLinkRangeToBuffer(
				lines,
				11,
				{
					startColumn: 15,
					startLineNumber: 1,
					endColumn: 30,
					endLineNumber: 1,
				},
				0,
			);
			expect(result).toEqual({
				start: { x: 4, y: 2 },
				end: { x: 7 + 1, y: 3 },
			});
		});

		it("should convert ranges for wide characters before and inside the link #2", () => {
			const lines = createBufferLineArray([
				{ text: "AAAAAAAAAAA", width: 11 },
				{ text: "A文 http://", width: 11 },
				{ text: "t.com/文/", width: 9 },
			]);
			const result = convertLinkRangeToBuffer(
				lines,
				11,
				{
					startColumn: 15,
					startLineNumber: 1,
					endColumn: 30,
					endLineNumber: 1,
				},
				0,
			);
			expect(result).toEqual({
				start: { x: 4 + 1, y: 2 },
				end: { x: 7 + 2, y: 3 },
			});
		});

		it("should convert ranges for several wide characters before the link", () => {
			const lines = createBufferLineArray([
				{ text: "A文文AAAAAA", width: 11 },
				{ text: "AA文文 http", width: 11 },
				{ text: "://t.com/f/", width: 11 },
			]);
			const result = convertLinkRangeToBuffer(
				lines,
				11,
				{
					startColumn: 15,
					startLineNumber: 1,
					endColumn: 30,
					endLineNumber: 1,
				},
				0,
			);
			expect(result).toEqual({
				start: { x: 3 + 4, y: 2 },
				end: { x: 6 + 4, y: 3 },
			});
		});

		it("should convert ranges for several wide characters before and inside the link", () => {
			const lines = createBufferLineArray([
				{ text: "A文文AAAAAA", width: 11 },
				{ text: "AA文文 http", width: 11 },
				{ text: "://t.com/文", width: 11 },
				{ text: "文/", width: 3 },
			]);
			// Text "A文文AAAAAAA文文 http://t.com/文文/" = 28 chars
			// Line 0: A(1)+文(2+pad)+文(2+pad)+A(1)*6 = 11 cells. Text offset +2 (2 CJK)
			// Line 1: A(1)*2+文(2+pad)+文(2+pad)+space(1)+h(1)+t(1)+t(1)+p(1) = 11 cells. Text offset +2 (2 CJK)
			// Line 2: :(1)+/(1)+/(1)+t(1)+.(1)+c(1)+o(1)+m(1)+/(1)+文(2) = 11 cells. Text offset +1 (1 CJK)
			// Line 3: 文(2)+/(1) = 3 cells. Text offset +1 (1 CJK)
			const result = convertLinkRangeToBuffer(
				lines,
				11,
				{
					startColumn: 14,
					startLineNumber: 1,
					endColumn: 31,
					endLineNumber: 1,
				},
				0,
			);
			expect(result).toEqual({
				start: { x: 5, y: 2 },
				end: { x: 1, y: 4 },
			});
		});
	});

	describe("getXtermLineContent", () => {
		it("should extract text from a single line", () => {
			const line = createMockBufferLine({ text: "hello world", width: 80 });
			const buffer = {
				getLine: (i: number) => (i === 0 ? line : undefined),
			};
			const result = getXtermLineContent(buffer as never, 0, 0, 80);
			expect(result).toBe("hello world");
		});

		it("should concatenate multiple wrapped lines", () => {
			// Note: translateToString(true) trims trailing whitespace, so the
			// first line's text must fill the width to preserve the trailing space.
			const line0 = createMockBufferLine({ text: "hello wor!", width: 10 });
			const line1 = createMockBufferLine({ text: "ld", width: 10 });
			const buffer = {
				getLine: (i: number) => {
					if (i === 0) return line0;
					if (i === 1) return line1;
					return undefined;
				},
			};
			const result = getXtermLineContent(buffer as never, 0, 1, 10);
			expect(result).toBe("hello wor!ld");
		});

		it("should cap lines to prevent excessive reads", () => {
			// With cols=10, maxLineLength = max(2048, 20) = 2048
			// lineEnd is capped to lineStart + 2048
			const lines = new Map<number, IBufferLine>();
			for (let i = 0; i < 300; i++) {
				lines.set(i, createMockBufferLine({ text: "a".repeat(10), width: 10 }));
			}
			const buffer = {
				getLine: (i: number) => lines.get(i),
			};
			// Even if we request 300 lines (3000 chars), it should cap
			const result = getXtermLineContent(buffer as never, 0, 299, 10);
			// With the cap, we should get at most ~2048 lines * cols worth of text
			expect(result.length).toBeLessThanOrEqual(2048 * 10);
		});

		it("should handle missing lines gracefully", () => {
			const buffer = {
				getLine: () => undefined,
			};
			const result = getXtermLineContent(buffer as never, 0, 0, 80);
			expect(result).toBe("");
		});
	});
});
