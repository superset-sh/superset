import { describe, expect, it, mock } from "bun:test";
import type { IBufferLine, ILink, Terminal } from "@xterm/xterm";
import { FilePathLinkProvider } from "./FilePathLinkProvider";

// Helper to create mock buffer lines
function createMockLine(text: string, isWrapped = false): IBufferLine {
	return {
		translateToString: () => text,
		isWrapped,
		length: text.length,
		getCell: mock(() => null),
		getCells: mock(() => []),
	} as unknown as IBufferLine;
}

// Helper to create a mock terminal with given lines
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

// Helper to extract links from callback
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

		it("should skip pure numbers", async () => {
			const terminal = createMockTerminal([{ text: "Line 123:456" }]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links.length).toBe(0);
		});
	});

	describe("wrapped lines - forward looking (next line)", () => {
		it("should detect path that spans current line and wrapped next line", async () => {
			// Simulate: "/path/to/very/long/fi" + "le/name.ts"
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
			// Line 1 is 21 chars, Line 2 is 10 chars
			const terminal = createMockTerminal([
				{ text: "/path/to/very/long/fi" }, // 21 chars
				{ text: "le/name.ts", isWrapped: true }, // 10 chars
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			const links = await getLinks(provider, 1);

			expect(links[0].range.start.x).toBe(1); // Start at column 1
			expect(links[0].range.start.y).toBe(1); // Line 1
			expect(links[0].range.end.x).toBe(11); // Ends at column 11 on line 2 (10 chars + 1)
			expect(links[0].range.end.y).toBe(2); // Line 2
		});
	});

	describe("wrapped lines - backward looking (previous line)", () => {
		it("should detect path from previous line when current line is wrapped", async () => {
			// Simulate: "/path/to/very/long/fi" + "le/name.ts"
			const terminal = createMockTerminal([
				{ text: "/path/to/very/long/fi" },
				{ text: "le/name.ts", isWrapped: true },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			// When scanning line 2 (the wrapped line), it should find the full path
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

			// Scan from line 2 (the wrapped line)
			const links = await getLinks(provider, 2);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("/usr/local/lib/node_modules/pkg/index.js:10");
		});
	});

	describe("three-line wrapping", () => {
		it("should handle path spanning three lines when scanned from middle", async () => {
			// This tests when current line is wrapped AND next line is also wrapped
			const terminal = createMockTerminal([
				{ text: "/path/to/ve" },
				{ text: "ry/long/dir", isWrapped: true },
				{ text: "/file.ts", isWrapped: true },
			]);
			const onOpen = mock();
			const provider = new FilePathLinkProvider(terminal, onOpen);

			// Scan from middle line
			const links = await getLinks(provider, 2);

			expect(links.length).toBe(1);
			expect(links[0].text).toBe("/path/to/very/long/dir/file.ts");
		});
	});

	describe("non-wrapped lines", () => {
		it("should not combine lines that are not wrapped", async () => {
			const terminal = createMockTerminal([
				{ text: "/path/one.ts" },
				{ text: "/path/two.ts", isWrapped: false }, // Real newline, not wrapped
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
});
