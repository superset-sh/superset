import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { ILink, Terminal } from "@xterm/xterm";
import { FilePathLinkProvider } from "./FilePathLinkProvider";

class MockMouseEvent {
	metaKey = false;
	ctrlKey = false;
	preventDefault = mock(() => {});

	constructor(
		_type: string,
		options?: { metaKey?: boolean; ctrlKey?: boolean },
	) {
		this.metaKey = options?.metaKey ?? false;
		this.ctrlKey = options?.ctrlKey ?? false;
	}
}

// Mock line-column-path
const mockParseLineColumnPath = mock((text: string) => {
	// Simple mock implementation for testing
	const match = text.match(/^(.+?)(?::(\d+))?(?::(\d+))?$/);
	if (!match) {
		return { file: null, line: undefined, column: undefined };
	}
	return {
		file: match[1] || null,
		line: match[2] ? Number.parseInt(match[2], 10) : undefined,
		column: match[3] ? Number.parseInt(match[3], 10) : undefined,
	};
});

mock.module("line-column-path", () => ({
	parseLineColumnPath: mockParseLineColumnPath,
}));

describe("FilePathLinkProvider", () => {
	let mockTerminal: Terminal;
	let mockOnOpen: ReturnType<typeof mock>;
	let provider: FilePathLinkProvider;
	let mockBuffer: {
		active: {
			getLine: ReturnType<typeof mock>;
		};
	};
	let mockLine: {
		translateToString: ReturnType<typeof mock>;
	};

	function createMockTerminal(): Terminal & { element: HTMLElement | null } {
		mockLine = {
			translateToString: mock((_preserveColors: boolean) => ""),
		};

		mockBuffer = {
			active: {
				getLine: mock((_lineNumber: number) => mockLine),
			},
		};

		const mockElement = {
			style: {
				cursor: "",
			},
		} as HTMLElement;

		return {
			buffer: mockBuffer as unknown as Terminal["buffer"],
			element: mockElement,
		} as Terminal & { element: HTMLElement | null };
	}

	beforeEach(() => {
		mockTerminal = createMockTerminal();
		mockOnOpen = mock(() => {});
		provider = new FilePathLinkProvider(mockTerminal, mockOnOpen);
	});

	afterEach(() => {
		mock.restore();
	});

	describe("provideLinks", () => {
		it("should return undefined when line does not exist", () => {
			mockBuffer.active.getLine.mockReturnValue(null);

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			expect(callback).toHaveBeenCalledWith(undefined);
		});

		it("should detect absolute file paths", () => {
			mockLine.translateToString.mockReturnValue("/absolute/path/to/file.ts");

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			expect(callback).toHaveBeenCalledTimes(1);
			const links = callback.mock.calls[0]?.[0];
			expect(links).toBeDefined();
			expect(links?.length).toBe(1);
			expect(links?.[0]?.text).toBe("/absolute/path/to/file.ts");
		});

		it("should detect relative file paths", () => {
			mockLine.translateToString.mockReturnValue("./relative/path/file.ts");

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			const links = callback.mock.calls[0]?.[0];
			expect(links).toBeDefined();
			expect(links?.[0]?.text).toBe("./relative/path/file.ts");
		});

		it("should detect file paths with line numbers", () => {
			mockLine.translateToString.mockReturnValue("src/components/App.tsx:45");

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			const links = callback.mock.calls[0]?.[0];
			expect(links?.[0]?.text).toBe("src/components/App.tsx:45");
		});

		it("should detect file paths with line and column numbers", () => {
			mockLine.translateToString.mockReturnValue(
				"src/components/App.tsx:45:12",
			);

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			const links = callback.mock.calls[0]?.[0];
			expect(links?.[0]?.text).toBe("src/components/App.tsx:45:12");
		});

		it("should detect directory paths", () => {
			mockLine.translateToString.mockReturnValue("/path/to/directory");

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			const links = callback.mock.calls[0]?.[0];
			expect(links?.[0]?.text).toBe("/path/to/directory");
		});

		it("should detect paths with dots", () => {
			mockLine.translateToString.mockReturnValue(".superset/navy-meadow-16");

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			const links = callback.mock.calls[0]?.[0];
			expect(links?.[0]?.text).toBe(".superset/navy-meadow-16");
		});

		it("should detect paths in error stack traces", () => {
			mockLine.translateToString.mockReturnValue(
				"at Object.<anonymous> (/path/to/file.js:10:15)",
			);

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			const links = callback.mock.calls[0]?.[0];
			expect(links).toBeDefined();
			expect(
				links?.some((link) => link.text.includes("/path/to/file.js:10:15")),
			).toBe(true);
		});

		it("should detect multiple file paths on the same line", () => {
			mockLine.translateToString.mockReturnValue(
				"Error in /path/to/file1.ts:10 and /path/to/file2.ts:20",
			);

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			const links = callback.mock.calls[0]?.[0];
			expect(links?.length).toBeGreaterThanOrEqual(2);
		});

		it("should skip HTTP URLs", () => {
			mockLine.translateToString.mockReturnValue(
				"See http://example.com/file.ts for details",
			);

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			const links = callback.mock.calls[0]?.[0];
			expect(links).toBeUndefined();
		});

		it("should skip HTTPS URLs", () => {
			mockLine.translateToString.mockReturnValue(
				"See https://example.com/file.ts for details",
			);

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			const links = callback.mock.calls[0]?.[0];
			expect(links).toBeUndefined();
		});

		it("should skip FTP URLs", () => {
			mockLine.translateToString.mockReturnValue("ftp://example.com/file.ts");

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			const links = callback.mock.calls[0]?.[0];
			expect(links).toBeUndefined();
		});

		it("should skip version numbers", () => {
			mockLine.translateToString.mockReturnValue("1.2.3");

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			const links = callback.mock.calls[0]?.[0];
			expect(links).toBeUndefined();
		});

		it("should skip version numbers with v prefix", () => {
			mockLine.translateToString.mockReturnValue("v1.2.3");

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			const links = callback.mock.calls[0]?.[0];
			expect(links).toBeUndefined();
		});

		it("should skip npm package references with versions", () => {
			mockLine.translateToString.mockReturnValue(
				"Found in package@1.0.0/dist/file.js",
			);

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			const links = callback.mock.calls[0]?.[0];
			expect(links).toBeUndefined();
		});

		it("should skip timestamps", () => {
			mockLine.translateToString.mockReturnValue("12:34:56");

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			const links = callback.mock.calls[0]?.[0];
			expect(links).toBeUndefined();
		});

		it("should set correct range coordinates", () => {
			mockLine.translateToString.mockReturnValue("  /path/to/file.ts  ");

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			const links = callback.mock.calls[0]?.[0];
			expect(links?.[0]?.range.start.y).toBe(1);
			expect(links?.[0]?.range.end.y).toBe(1);
			expect(links?.[0]?.range.start.x).toBeGreaterThan(0);
			const startX = links?.[0]?.range.start.x;
			const endX = links?.[0]?.range.end.x;
			expect(startX).toBeDefined();
			expect(endX).toBeDefined();
			if (startX !== undefined && endX !== undefined) {
				expect(endX).toBeGreaterThan(startX);
			}
		});

		it("should return undefined when no links found", () => {
			mockLine.translateToString.mockReturnValue(
				"just some text without paths",
			);

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			expect(callback).toHaveBeenCalledWith(undefined);
		});
	});

	describe("handleHover", () => {
		it("should change cursor to pointer", () => {
			const mockElement = {
				style: { cursor: "" },
			} as HTMLElement;
			(mockTerminal as { element: HTMLElement | null }).element = mockElement;

			provider.handleHover(
				new MockMouseEvent("mouseover") as unknown as MouseEvent,
				"/path/to/file.ts",
			);

			expect(mockElement.style.cursor).toBe("pointer");
		});

		it("should handle missing terminal element gracefully", () => {
			(mockTerminal as { element: HTMLElement | null }).element = null;

			expect(() => {
				provider.handleHover(
					new MockMouseEvent("mouseover") as unknown as MouseEvent,
					"/path/to/file.ts",
				);
			}).not.toThrow();
		});
	});

	describe("handleLeave", () => {
		it("should change cursor to default", () => {
			const mockElement = {
				style: { cursor: "" },
			} as HTMLElement;
			(mockTerminal as { element: HTMLElement | null }).element = mockElement;

			provider.handleLeave(
				new MockMouseEvent("mouseout") as unknown as MouseEvent,
				"/path/to/file.ts",
			);

			expect(mockElement.style.cursor).toBe("default");
		});

		it("should handle missing terminal element gracefully", () => {
			(mockTerminal as { element: HTMLElement | null }).element = null;

			expect(() => {
				provider.handleLeave(
					new MockMouseEvent("mouseout") as unknown as MouseEvent,
					"/path/to/file.ts",
				);
			}).not.toThrow();
		});
	});

	describe("handleActivation", () => {
		beforeEach(() => {
			mockParseLineColumnPath.mockImplementation((text: string) => {
				const match = text.match(/^(.+?)(?::(\d+))?(?::(\d+))?$/);
				if (!match) {
					return { file: null, line: undefined, column: undefined };
				}
				return {
					file: match[1] || null,
					line: match[2] ? Number.parseInt(match[2], 10) : undefined,
					column: match[3] ? Number.parseInt(match[3], 10) : undefined,
				};
			});
		});

		it("should call onOpen with file path on Cmd+Click (macOS)", () => {
			const event = new MockMouseEvent("click", {
				metaKey: true,
			}) as unknown as MouseEvent;

			provider.handleActivation(event, "/path/to/file.ts");

			expect(event.preventDefault).toHaveBeenCalled();
			expect(mockOnOpen).toHaveBeenCalledWith(
				event,
				"/path/to/file.ts",
				undefined,
				undefined,
			);
		});

		it("should call onOpen with file path on Ctrl+Click (Windows/Linux)", () => {
			const event = new MockMouseEvent("click", {
				ctrlKey: true,
			}) as unknown as MouseEvent;

			provider.handleActivation(event, "/path/to/file.ts");

			expect(event.preventDefault).toHaveBeenCalled();
			expect(mockOnOpen).toHaveBeenCalledWith(
				event,
				"/path/to/file.ts",
				undefined,
				undefined,
			);
		});

		it("should call onOpen with line number", () => {
			const event = new MockMouseEvent("click", {
				metaKey: true,
			}) as unknown as MouseEvent;

			provider.handleActivation(event, "/path/to/file.ts:45");

			expect(mockOnOpen).toHaveBeenCalledWith(
				event,
				"/path/to/file.ts",
				45,
				undefined,
			);
		});

		it("should call onOpen with line and column numbers", () => {
			const event = new MockMouseEvent("click", {
				metaKey: true,
			}) as unknown as MouseEvent;

			provider.handleActivation(event, "/path/to/file.ts:45:12");

			expect(mockOnOpen).toHaveBeenCalledWith(
				event,
				"/path/to/file.ts",
				45,
				12,
			);
		});

		it("should not activate on regular click without modifier", () => {
			const event = new MockMouseEvent("click") as unknown as MouseEvent;

			provider.handleActivation(event, "/path/to/file.ts");

			expect(event.preventDefault).not.toHaveBeenCalled();
			expect(mockOnOpen).not.toHaveBeenCalled();
		});

		it("should not activate when parsed file is null", () => {
			mockParseLineColumnPath.mockReturnValue({
				file: null,
				line: undefined,
				column: undefined,
			});

			const event = new MockMouseEvent("click", {
				metaKey: true,
			}) as unknown as MouseEvent;

			provider.handleActivation(event, "invalid");

			expect(event.preventDefault).toHaveBeenCalled();
			expect(mockOnOpen).not.toHaveBeenCalled();
		});

		it("should handle paths with special characters", () => {
			const event = new MockMouseEvent("click", {
				metaKey: true,
			}) as unknown as MouseEvent;

			provider.handleActivation(event, "/path/to/file-name_123.ts");

			expect(mockOnOpen).toHaveBeenCalledWith(
				event,
				"/path/to/file-name_123.ts",
				undefined,
				undefined,
			);
		});
	});

	describe("link lifecycle", () => {
		it("should create links with activate handler", () => {
			mockLine.translateToString.mockReturnValue("/path/to/file.ts");

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			const links = callback.mock.calls[0]?.[0];
			expect(links?.[0]?.activate).toBeDefined();
			expect(typeof links?.[0]?.activate).toBe("function");
		});

		it("should create links with hover handler", () => {
			mockLine.translateToString.mockReturnValue("/path/to/file.ts");

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			const links = callback.mock.calls[0]?.[0];
			expect(links?.[0]?.hover).toBeDefined();
			expect(typeof links?.[0]?.hover).toBe("function");
		});

		it("should create links with leave handler", () => {
			mockLine.translateToString.mockReturnValue("/path/to/file.ts");

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			const links = callback.mock.calls[0]?.[0];
			expect(links?.[0]?.leave).toBeDefined();
			expect(typeof links?.[0]?.leave).toBe("function");
		});

		it("should create links with dispose handler", () => {
			mockLine.translateToString.mockReturnValue("/path/to/file.ts");

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			const links = callback.mock.calls[0]?.[0];
			expect(links?.[0]?.dispose).toBeDefined();
			expect(typeof links?.[0]?.dispose).toBe("function");
		});

		it("should call activate handler when link is activated", () => {
			mockLine.translateToString.mockReturnValue("/path/to/file.ts");

			const callback = mock((_links: ILink[] | undefined) => {});
			provider.provideLinks(1, callback);

			const links = callback.mock.calls[0]?.[0];
			const activateHandler = links?.[0]?.activate;
			expect(activateHandler).toBeDefined();

			const event = new MockMouseEvent("click", {
				metaKey: true,
			}) as unknown as MouseEvent;

			activateHandler?.(event, "/path/to/file.ts");

			expect(mockOnOpen).toHaveBeenCalled();
		});
	});
});
