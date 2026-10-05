import "../../../main/terminal-host/xterm-env-polyfill";
import { describe, expect, it } from "bun:test";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { Terminal } from "@xterm/headless";
import type { Terminal as XTerm } from "@xterm/xterm";
import { getTerminalSelectionForCopy } from "./terminal-copy";

async function copyBuffer({
	input,
	cols = 5,
	rows = 10,
	start = { x: 0, y: 0 },
	end,
	rectangle = false,
}: {
	input: string;
	cols?: number;
	rows?: number;
	start?: { x: number; y: number };
	end: { x: number; y: number };
	rectangle?: boolean;
}) {
	const terminal = new Terminal({ cols, rows, allowProposedApi: true });
	try {
		terminal.loadAddon(new Unicode11Addon());
		terminal.unicode.activeVersion = "11";
		await new Promise<void>((resolve) => terminal.write(input, resolve));
		return getTerminalSelectionForCopy({
			buffer: terminal.buffer,
			getSelection: () => "unused raw selection",
			getSelectionPosition: () => ({ start, end }),
			_core: { _selectionService: { _activeSelectionMode: rectangle ? 3 : 0 } },
		} as unknown as XTerm);
	} finally {
		terminal.dispose();
	}
}

// Ported from ghostty e88c6c099 src/terminal/Screen.zig selectionString tests;
// Ghostty's inclusive end column becomes xterm's exclusive end column.
describe("Ghostty selectionString parity on xterm buffers", () => {
	it.each([
		{
			name: "basic",
			input: "1ABCD\r\n2EFGH\r\n3IJKL",
			start: { x: 0, y: 1 },
			end: { x: 3, y: 2 },
			expected: "2EFGH\n3IJ",
		},
		{
			name: "wide char both cells",
			input: "1A⚡",
			end: { x: 4, y: 0 },
			expected: "1A⚡",
		},
		{
			name: "wide char tail only",
			input: "1A⚡",
			start: { x: 3, y: 0 },
			end: { x: 4, y: 0 },
			expected: "⚡",
		},
		{
			name: "wide char with header",
			input: "1ABC⚡",
			end: { x: 5, y: 0 },
			expected: "1ABC⚡",
		},
		{
			name: "empty with soft wrap",
			input: "👨      ",
			start: { x: 1, y: 0 },
			end: { x: 3, y: 0 },
			expected: "👨",
		},
		{
			name: "with zero width joiner",
			input: "👨‍",
			cols: 10,
			end: { x: 2, y: 0 },
			expected: "👨‍",
		},
		{
			name: "rectangle basic",
			input:
				"Lorem ipsum dolor\r\nsit amet, consectetur\r\nadipiscing elit, sed do\r\neiusmod tempor incididunt\r\nut labore et dolore",
			cols: 30,
			start: { x: 2, y: 1 },
			end: { x: 7, y: 3 },
			rectangle: true,
			expected: "t ame\nipisc\nusmod",
		},
		{
			name: "rectangle more complex with breaks",
			input:
				"Lorem ipsum dolor\r\nsit amet, consectetur\r\nadipiscing elit, sed do\r\neiusmod tempor incididunt\r\nut labore et dolore\r\n\r\nmagna aliqua. Ut enim\r\nad minim veniam, quis",
			cols: 30,
			start: { x: 11, y: 2 },
			end: { x: 27, y: 7 },
			rectangle: true,
			expected:
				"elit, sed do\npor incididunt\nt dolore\n\na. Ut enim\nniam, quis",
		},

		{
			name: "trim space",
			input: "1AB  \r\n2EFGH\r\n3IJKL",
			end: { x: 3, y: 1 },
			expected: "1AB\n2EF",
		},
		{
			name: "trim empty line",
			input: "1AB  \r\n\r\n2EFGH\r\n3IJKL",
			end: { x: 3, y: 2 },
			expected: "1AB\n\n2EF",
		},
		{
			name: "soft wrap",
			input: "1ABCD2EFGH3IJKL",
			start: { x: 0, y: 1 },
			end: { x: 3, y: 2 },
			expected: "2EFGH3IJ",
		},
		{
			name: "end outside of written area",
			input: "1ABCD\r\n2EFGH\r\n3IJKL",
			start: { x: 0, y: 2 },
			end: { x: 3, y: 6 },
			expected: "3IJKL",
		},
		{
			name: "outside written area",
			input: "1ABCD",
			start: { x: 0, y: 5 },
			end: { x: 3, y: 6 },
			expected: "",
		},
		{ name: "wide char", input: "1A⚡", end: { x: 3, y: 0 }, expected: "1A⚡" },
	])("$name", async ({ expected, ...fixture }) => {
		expect(await copyBuffer(fixture)).toBe(expected);
	});

	// xterm uses a scrollback ring instead of Ghostty's page list.
	it("multi-page equivalent across scrollback and the active screen", async () => {
		expect(
			await copyBuffer({
				input: `${"\r\n".repeat(200)}123456789\r\n!@#$%^&*(\r\n123456789\r\nnext`,
				cols: 10,
				rows: 3,
				start: { x: 0, y: 200 },
				end: { x: 3, y: 202 },
			}),
		).toBe("123456789\n!@#$%^&*(\n123");
	});

	it("rectangle with EOL in both horizontal drag directions", async () => {
		for (const [left, right] of [
			[12, 27],
			[27, 12],
		]) {
			expect(
				await copyBuffer({
					input:
						"Lorem ipsum dolor\r\nsit amet, consectetur\r\nadipiscing elit, sed do\r\neiusmod tempor incididunt\r\nut labore et dolore",
					cols: 30,
					start: { x: left, y: 0 },
					end: { x: right, y: 4 },
					rectangle: true,
				}),
			).toBe("dolor\nnsectetur\nlit, sed do\nor incididunt\n dolore");
		}
	});

	it("distinguishes written spaces from unwritten trailing rows", async () => {
		for (const [input, expected] of [
			["a\r\n", "a"],
			["a\r\n   ", "a\n"],
			["\r\n\r\na", "\n\na"],
		]) {
			expect(await copyBuffer({ input, end: { x: 5, y: 5 } })).toBe(expected);
		}
	});

	it("unwraps a rectangular selection using Ghostty's row wrap flags", async () => {
		expect(
			await copyBuffer({
				input: "abcdefghij",
				start: { x: 1, y: 0 },
				end: { x: 4, y: 1 },
				rectangle: true,
			}),
		).toBe("bcdghi");
	});

	it.each([
		{
			name: "single line",
			input: "abc  ",
			end: { x: 5, y: 0 },
			expected: "abc",
		},
		{
			name: "partial line",
			input: "a  bc",
			end: { x: 3, y: 0 },
			expected: "a",
		},
		{ name: "only spaces", input: "     ", end: { x: 5, y: 0 }, expected: "" },
		{
			name: "interior wrap spaces",
			input: "abc    def",
			end: { x: 5, y: 1 },
			expected: "abc    def",
		},
		{
			name: "selected wrap boundary",
			input: "abc    def",
			end: { x: 5, y: 0 },
			expected: "abc",
		},
		{
			name: "Unicode spaces",
			input: "a\u00a0\u3000 ",
			cols: 10,
			end: { x: 5, y: 0 },
			expected: "a\u00a0\u3000",
		},
		{
			name: "tab expansion",
			input: "a\tb  ",
			cols: 20,
			end: { x: 11, y: 0 },
			expected: "a       b",
		},
		{
			name: "wide wrap spacer",
			input: "abcd⚡z",
			end: { x: 3, y: 1 },
			expected: "abcd⚡z",
		},
		{
			name: "indentation and blank rows",
			input: "  a\r\n\r\n  b  ",
			end: { x: 5, y: 2 },
			expected: "  a\n\n  b",
		},
	])("$name", async ({ expected, ...fixture }) => {
		expect(await copyBuffer(fixture)).toBe(expected);
	});
});
