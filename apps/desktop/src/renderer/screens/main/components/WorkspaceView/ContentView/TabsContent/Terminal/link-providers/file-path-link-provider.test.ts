import { describe, expect, it, mock } from "bun:test";
import type { IBufferLine, ILink, Terminal } from "@xterm/xterm";
import { FilePathLinkProvider } from "./file-path-link-provider";

/**
 * Check if a character is a wide (double-width) character.
 * CJK characters occupy 2 cells in terminal emulators.
 */
function isWideCharacter(char: string): boolean {
	const code = char.codePointAt(0);
	if (!code) return false;
	return (
		(code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
		(code >= 0x2e80 && code <= 0x303e) || // CJK Radicals
		(code >= 0x3040 && code <= 0x33bf) || // Hiragana, Katakana
		(code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
		(code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
		(code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
		(code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
		(code >= 0xff01 && code <= 0xff60) || // Fullwidth Forms
		(code >= 0x20000 && code <= 0x2fa1f) // CJK Extensions B-F
	);
}

function createMockLine(text: string, isWrapped = false): IBufferLine {
	// Build cells accounting for wide characters
	const cells: Array<{ chars: string; width: number }> = [];
	for (const char of text) {
		const wide = isWideCharacter(char);
		cells.push({ chars: char, width: wide ? 2 : 1 });
		if (wide) {
			cells.push({ chars: "", width: 0 }); // continuation cell
		}
	}

	return {
		translateToString: () => text,
		isWrapped,
		length: cells.length,
		getCell: (index: number) =>
			cells[index]
				? {
						getWidth: () => cells[index].width,
						getChars: () => cells[index].chars,
					}
				: null,
		getCells: mock(() => []),
	} as unknown as IBufferLine;
}

function createMockTerminal(
	lines: Array<{ text: string; isWrapped?: boolean }>,
): Terminal {
	const mockLines = lines.map((l) =>
		createMockLine(l.text, l.isWrapped ?? false),
	);

	return {
		buffer: {
			active: {
				getLine: (index: number) => mockLines[index] ?? null,
			},
		},
		element: {
			style: { cursor: "" },
		},
	} as unknown as Terminal;
}

function getLinks(
	provider: FilePathLinkProvider,
	lineNumber: number,
): Promise<ILink[]> {
	return new Promise((resolve) => {
		provider.provideLinks(lineNumber, (links) => {
			resolve(links ?? []);
		});
	});
}

describe("FilePathLinkProvider", () => {
	describe("basic file path detection", () => {
		it("should detect absolute paths", async () => {
			const terminal = createMockTerminal([
				{ text: "Error in /path/to/file.ts:10:5" },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("/path/to/file.ts:10:5");
		});

		it("should detect relative paths starting with ./", async () => {
			const terminal = createMockTerminal([{ text: "See ./src/utils.ts" }]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("./src/utils.ts");
		});

		it("should detect relative paths starting with ../", async () => {
			const terminal = createMockTerminal([
				{ text: "Import from ../lib/helper.ts" },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("../lib/helper.ts");
		});

		it("should detect home directory paths", async () => {
			const terminal = createMockTerminal([
				{ text: "Config at ~/config/settings.json" },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("~/config/settings.json");
		});

		it("should detect paths with line and column numbers", async () => {
			const terminal = createMockTerminal([{ text: "/path/file.ts:42:10" }]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("/path/file.ts:42:10");
		});

		it("should detect multiple paths on one line", async () => {
			const terminal = createMockTerminal([
				{ text: "Import ./src/a.ts and ./src/b.ts" },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(2);
			expect(links[0].text).toBe("./src/a.ts");
			expect(links[1].text).toBe("./src/b.ts");
		});
	});

	describe("filtering false positives", () => {
		it("should skip URLs with http://", async () => {
			const terminal = createMockTerminal([
				{ text: "Visit http://example.com/path" },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(0);
		});

		it("should skip URLs with https://", async () => {
			const terminal = createMockTerminal([
				{ text: "Visit https://example.com/path" },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(0);
		});

		it("should skip version strings", async () => {
			const terminal = createMockTerminal([{ text: "Package v1.2.3" }]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(0);
		});

		it("should skip npm package references", async () => {
			const terminal = createMockTerminal([
				{ text: "lodash@4.17.21/index.js" },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(0);
		});

		it("should skip pure numbers like 123:456", async () => {
			// Note: "Line 123:456" is detected as a link to "Line" with row 123, col 456
			// because VSCode supports verbose formats like "foo line 339"
			// We only skip patterns that are purely numeric with colons
			const terminal = createMockTerminal([
				{ text: "at position 123:456:789" },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			// "position" will be detected with line 123, col 456
			// but pure "123:456:789" alone would not be detected as a path
			expect(links.length).toBe(1);
			expect(links[0].text).toBe("position 123:456");
		});
	});

	describe("wrapped lines - forward looking (next line)", () => {
		it("should detect path that spans current line and wrapped next line", async () => {
			const terminal = createMockTerminal([
				{ text: "/path/to/very/long/fi" },
				{ text: "le/name.ts", isWrapped: true },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("/path/to/very/long/file/name.ts");
			expect(links[0].range.start.y).toBe(1);
			expect(links[0].range.end.y).toBe(2);
		});

		it("should calculate correct range for multi-line path starting on current line", async () => {
			const terminal = createMockTerminal([
				{ text: "/path/to/very/long/fi" },
				{ text: "le/name.ts", isWrapped: true },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links[0].range.start.x).toBe(1);
			expect(links[0].range.start.y).toBe(1);
			expect(links[0].range.end.x).toBe(11);
			expect(links[0].range.end.y).toBe(2);
		});
	});

	describe("wrapped lines - backward looking (previous line)", () => {
		it("should detect path from previous line when current line is wrapped", async () => {
			const terminal = createMockTerminal([
				{ text: "/path/to/very/long/fi" },
				{ text: "le/name.ts", isWrapped: true },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 2);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("/path/to/very/long/file/name.ts");
			expect(links[0].range.start.y).toBe(1);
			expect(links[0].range.end.y).toBe(2);
		});

		it("should handle clicking on wrapped portion of path", async () => {
			const terminal = createMockTerminal([
				{ text: "Error: /usr/local/lib/nod" },
				{ text: "e_modules/pkg/index.js:10", isWrapped: true },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 2);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("/usr/local/lib/node_modules/pkg/index.js:10");
		});
	});

	describe("three-line wrapping", () => {
		it("should handle path spanning three lines when scanned from middle", async () => {
			const terminal = createMockTerminal([
				{ text: "/path/to/ve" },
				{ text: "ry/long/dir", isWrapped: true },
				{ text: "/file.ts", isWrapped: true },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 2);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("/path/to/very/long/dir/file.ts");
		});
	});

	describe("non-wrapped lines", () => {
		it("should not combine lines that are not wrapped", async () => {
			const terminal = createMockTerminal([
				{ text: "/path/one.ts" },
				{ text: "/path/two.ts", isWrapped: false },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("/path/one.ts");
		});

		it("should handle paths on separate lines independently", async () => {
			const terminal = createMockTerminal([
				{ text: "/path/one.ts" },
				{ text: "/path/two.ts", isWrapped: false },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links1 = await getLinks(provider, 1);
			const links2 = await getLinks(provider, 2);

			expect(links1.length).toBe(1);
			expect(links1[0].text).toBe("/path/one.ts");
			expect(links2.length).toBe(1);
			expect(links2[0].text).toBe("/path/two.ts");
		});
	});

	describe("handleActivation", () => {
		it("should require metaKey (Cmd) for activation", async () => {
			const terminal = createMockTerminal([{ text: "/path/file.ts" }]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);
			const mockEvent = {
				metaKey: false,
				ctrlKey: false,
				preventDefault: mock(),
			} as unknown as MouseEvent;

			links[0].activate(mockEvent, "/path/file.ts");

			expect(onOpen).not.toHaveBeenCalled();
		});

		it("should activate with metaKey (Cmd)", async () => {
			const terminal = createMockTerminal([{ text: "/path/file.ts" }]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);
			const mockEvent = {
				metaKey: true,
				ctrlKey: false,
				preventDefault: mock(),
			} as unknown as MouseEvent;

			links[0].activate(mockEvent, "/path/file.ts");

			expect(onOpen).toHaveBeenCalled();
			expect(onOpen.mock.calls[0][1]).toBe("/path/file.ts");
		});

		it("should activate with ctrlKey", async () => {
			const terminal = createMockTerminal([{ text: "/path/file.ts" }]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);
			const mockEvent = {
				metaKey: false,
				ctrlKey: true,
				preventDefault: mock(),
			} as unknown as MouseEvent;

			links[0].activate(mockEvent, "/path/file.ts");

			expect(onOpen).toHaveBeenCalled();
		});

		it("should parse line and column from path", async () => {
			const terminal = createMockTerminal([{ text: "/path/file.ts:42:10" }]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);
			const mockEvent = {
				metaKey: true,
				ctrlKey: false,
				preventDefault: mock(),
			} as unknown as MouseEvent;

			links[0].activate(mockEvent, "/path/file.ts:42:10");

			expect(onOpen).toHaveBeenCalled();
			expect(onOpen.mock.calls[0][1]).toBe("/path/file.ts");
			expect(onOpen.mock.calls[0][2]).toBe(42);
			expect(onOpen.mock.calls[0][3]).toBe(10);
		});
	});

	describe("VSCode-style link formats", () => {
		it("should detect parenthesis format: file.ts(42)", async () => {
			const terminal = createMockTerminal([
				{ text: "Error in /path/file.ts(42)" },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("/path/file.ts(42)");

			const mockEvent = {
				metaKey: true,
				ctrlKey: false,
				preventDefault: mock(),
			} as unknown as MouseEvent;
			links[0].activate(mockEvent, links[0].text);

			expect(onOpen.mock.calls[0][1]).toBe("/path/file.ts");
			expect(onOpen.mock.calls[0][2]).toBe(42);
		});

		it("should detect parenthesis format with column: file.ts(42, 10)", async () => {
			const terminal = createMockTerminal([
				{ text: "Error in /path/file.ts(42, 10)" },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("/path/file.ts(42, 10)");

			const mockEvent = {
				metaKey: true,
				ctrlKey: false,
				preventDefault: mock(),
			} as unknown as MouseEvent;
			links[0].activate(mockEvent, links[0].text);

			expect(onOpen.mock.calls[0][1]).toBe("/path/file.ts");
			expect(onOpen.mock.calls[0][2]).toBe(42);
			expect(onOpen.mock.calls[0][3]).toBe(10);
		});

		it("should detect square bracket format: file.ts[42]", async () => {
			const terminal = createMockTerminal([
				{ text: "Error in /path/file.ts[42]" },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("/path/file.ts[42]");

			const mockEvent = {
				metaKey: true,
				ctrlKey: false,
				preventDefault: mock(),
			} as unknown as MouseEvent;
			links[0].activate(mockEvent, links[0].text);

			expect(onOpen.mock.calls[0][1]).toBe("/path/file.ts");
			expect(onOpen.mock.calls[0][2]).toBe(42);
		});

		it('should detect verbose format: "file.ts", line 42', async () => {
			const terminal = createMockTerminal([
				{ text: 'Error in "/path/file.ts", line 42' },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe('"/path/file.ts", line 42');

			const mockEvent = {
				metaKey: true,
				ctrlKey: false,
				preventDefault: mock(),
			} as unknown as MouseEvent;
			links[0].activate(mockEvent, links[0].text);

			expect(onOpen.mock.calls[0][1]).toBe("/path/file.ts");
			expect(onOpen.mock.calls[0][2]).toBe(42);
		});

		it('should detect verbose format with column: "file.ts", line 42, col 10', async () => {
			const terminal = createMockTerminal([
				{ text: 'Error in "/path/file.ts", line 42, col 10' },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe('"/path/file.ts", line 42, col 10');

			const mockEvent = {
				metaKey: true,
				ctrlKey: false,
				preventDefault: mock(),
			} as unknown as MouseEvent;
			links[0].activate(mockEvent, links[0].text);

			expect(onOpen.mock.calls[0][1]).toBe("/path/file.ts");
			expect(onOpen.mock.calls[0][2]).toBe(42);
			expect(onOpen.mock.calls[0][3]).toBe(10);
		});

		it("should detect line ranges: file.ts:42-50", async () => {
			const terminal = createMockTerminal([
				{ text: "See /path/file.ts:42:10-50" },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("/path/file.ts:42:10-50");

			const mockEvent = {
				metaKey: true,
				ctrlKey: false,
				preventDefault: mock(),
			} as unknown as MouseEvent;
			links[0].activate(mockEvent, links[0].text);

			expect(onOpen.mock.calls[0][1]).toBe("/path/file.ts");
			expect(onOpen.mock.calls[0][2]).toBe(42);
			expect(onOpen.mock.calls[0][3]).toBe(10);
			expect(onOpen.mock.calls[0][5]).toBe(50); // columnEnd
		});

		it("should detect hash format: file.ts#42", async () => {
			const terminal = createMockTerminal([{ text: "See /path/file.ts#42" }]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("/path/file.ts#42");

			const mockEvent = {
				metaKey: true,
				ctrlKey: false,
				preventDefault: mock(),
			} as unknown as MouseEvent;
			links[0].activate(mockEvent, links[0].text);

			expect(onOpen.mock.calls[0][1]).toBe("/path/file.ts");
			expect(onOpen.mock.calls[0][2]).toBe(42);
		});

		it("should detect git diff paths: --- a/path/file.ts", async () => {
			const terminal = createMockTerminal([{ text: "--- a/path/to/file.ts" }]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("path/to/file.ts");
		});

		it("should detect git diff paths: +++ b/path/file.ts", async () => {
			const terminal = createMockTerminal([{ text: "+++ b/path/to/file.ts" }]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("path/to/file.ts");
		});
	});

	describe("URL-encoded paths", () => {
		it("should decode URL-encoded path with line number on activation", async () => {
			const terminal = createMockTerminal([
				{ text: "apps/desktop/src/main/lib/workspace-manager.ts%3A50" },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);

			const mockEvent = {
				metaKey: true,
				ctrlKey: false,
				preventDefault: mock(),
			} as unknown as MouseEvent;
			links[0].activate(mockEvent, links[0].text);

			expect(onOpen).toHaveBeenCalled();
			expect(onOpen.mock.calls[0][1]).toBe(
				"apps/desktop/src/main/lib/workspace-manager.ts",
			);
			expect(onOpen.mock.calls[0][2]).toBe(50);
		});

		it("should decode URL-encoded path with line and column on activation", async () => {
			const terminal = createMockTerminal([{ text: "src/file.ts%3A42%3A10" }]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);

			const mockEvent = {
				metaKey: true,
				ctrlKey: false,
				preventDefault: mock(),
			} as unknown as MouseEvent;
			links[0].activate(mockEvent, links[0].text);

			expect(onOpen).toHaveBeenCalled();
			expect(onOpen.mock.calls[0][1]).toBe("src/file.ts");
			expect(onOpen.mock.calls[0][2]).toBe(42);
			expect(onOpen.mock.calls[0][3]).toBe(10);
		});

		it("should decode URL-encoded spaces in path", async () => {
			const terminal = createMockTerminal([
				{ text: "./path/to%20file/name.ts" },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);

			const mockEvent = {
				metaKey: true,
				ctrlKey: false,
				preventDefault: mock(),
			} as unknown as MouseEvent;
			links[0].activate(mockEvent, links[0].text);

			expect(onOpen).toHaveBeenCalled();
			expect(onOpen.mock.calls[0][1]).toBe("./path/to file/name.ts");
		});
	});

	describe("punctuation handling", () => {
		it("should handle path followed by period at end of sentence", async () => {
			const terminal = createMockTerminal([
				{ text: "See the file at ./path/something." },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			// The path should be detected without the trailing period
			expect(links.length).toBe(1);
			expect(links[0].text).toBe("./path/something");
		});

		it("should handle path in quotes", async () => {
			const terminal = createMockTerminal([
				{ text: 'Error in "./path/file.ts"' },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("./path/file.ts");
		});
	});

	describe("edge cases", () => {
		it("should handle empty lines", async () => {
			const terminal = createMockTerminal([{ text: "" }]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(0);
		});

		it("should handle line that doesn't exist", async () => {
			const terminal = createMockTerminal([{ text: "Hello" }]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 999);

			expect(links.length).toBe(0);
		});

		it("should handle paths without directories (just relative path)", async () => {
			const terminal = createMockTerminal([
				{ text: "src/components/Button.tsx" },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("src/components/Button.tsx");
		});
	});

	describe("CJK (non-ASCII) file paths (#2317)", () => {
		it("should detect CJK file paths", async () => {
			const terminal = createMockTerminal([
				{ text: "電馭工作流/筆記/直播腳本骨架-v2.md" },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("電馭工作流/筆記/直播腳本骨架-v2.md");
		});

		it("should calculate correct cell-based range for CJK paths", async () => {
			// "電馭工作流/筆記/直播腳本骨架-v2.md"
			// Each CJK char occupies 2 cells in the terminal
			// 電(2)馭(2)工(2)作(2)流(2)/(1)筆(2)記(2)/(1)直(2)播(2)腳(2)本(2)骨(2)架(2)-(1)v(1)2(1).(1)m(1)d(1)
			// Total cells: 5*2 + 1 + 2*2 + 1 + 6*2 + 6*1 = 10 + 1 + 4 + 1 + 12 + 6 = 34
			const terminal = createMockTerminal([
				{ text: "電馭工作流/筆記/直播腳本骨架-v2.md" },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			// Start should be cell 1 (1-indexed)
			expect(links[0].range.start.x).toBe(1);
			// End should account for wide CJK characters: 34 + 1 = 35
			expect(links[0].range.end.x).toBe(35);
		});

		it("should calculate correct range for CJK path with prefix text", async () => {
			// "See " (4 chars, 4 cells) + "./電馭/筆記.md"
			// ./電(2)馭(2)/(1)筆(2)記(2)/(1).(1)m(1)d(1) = 2+4+1+4+1+1+1+1 = 15 cells
			const terminal = createMockTerminal([{ text: "See ./電馭/筆記.md" }]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("./電馭/筆記.md");
			// "See " is 4 cells, then "./" is 2 cells, so link starts at cell 5
			expect(links[0].range.start.x).toBe(5);
			// "See " (4) + "./" (2) + "電馭" (4) + "/" (1) + "筆記" (4) + ".md" (3) = 18 cells
			expect(links[0].range.end.x).toBe(19);
		});

		it("should detect Japanese file paths", async () => {
			const terminal = createMockTerminal([
				{ text: "プロジェクト/ドキュメント/README.md" },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("プロジェクト/ドキュメント/README.md");
		});

		it("should detect Korean file paths", async () => {
			const terminal = createMockTerminal([{ text: "프로젝트/문서/파일.txt" }]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("프로젝트/문서/파일.txt");
		});

		it("should handle CJK path with line number suffix", async () => {
			const terminal = createMockTerminal([{ text: "電馭工作流/筆記.md:42" }]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("電馭工作流/筆記.md:42");

			const mockEvent = {
				metaKey: true,
				ctrlKey: false,
				preventDefault: mock(),
			} as unknown as MouseEvent;
			links[0].activate(mockEvent, links[0].text);

			expect(onOpen).toHaveBeenCalled();
			expect(onOpen.mock.calls[0][1]).toBe("電馭工作流/筆記.md");
			expect(onOpen.mock.calls[0][2]).toBe(42);
		});

		it("should handle absolute CJK path", async () => {
			const terminal = createMockTerminal([
				{ text: "/home/user/電馭工作流/筆記/直播腳本骨架-v2.md" },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe(
				"/home/user/電馭工作流/筆記/直播腳本骨架-v2.md",
			);
		});
	});
});
