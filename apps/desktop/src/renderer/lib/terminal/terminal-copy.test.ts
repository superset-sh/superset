import { describe, expect, it, mock, spyOn } from "bun:test";
import type { Terminal as XTerm } from "@xterm/xterm";
import {
	getTerminalSelectionForCopy,
	installTerminalCopyHandler,
	trimTerminalSelection,
} from "./terminal-copy";

function terminalStub(
	selection: string,
	{ mode = 0, remainder = "   ", wrapped = false, singleLine = false } = {},
): XTerm {
	return {
		element: new EventTarget(),
		getSelection: () => selection,
		getSelectionPosition: () => ({
			start: { x: 0, y: 0 },
			end: { x: 4, y: singleLine ? 0 : 2 },
		}),
		buffer: {
			active: {
				getLine: (row: number) =>
					row === (singleLine ? 1 : 3)
						? { isWrapped: wrapped }
						: { translateToString: () => remainder },
			},
		},
		_core: { _selectionService: { _activeSelectionMode: mode } },
	} as unknown as XTerm;
}

function copyEvent(clipboardData: unknown = null): ClipboardEvent {
	const event = new Event("copy", { cancelable: true });
	Object.defineProperty(event, "clipboardData", { value: clipboardData });
	return event as ClipboardEvent;
}

describe("trimTerminalSelection", () => {
	it("removes ASCII row padding while preserving indentation and blank lines", () => {
		expect(trimTerminalSelection("  first  \n   \n  last  ")).toBe(
			"  first\n\n  last",
		);
	});
	it("preserves Unicode whitespace and tabs", () => {
		expect(trimTerminalSelection("日本語\u3000  \nvalue\u202f\t  ")).toBe(
			"日本語\u3000\nvalue\u202f\t",
		);
	});
	it("preserves CRLF and mixed line endings", () => {
		expect(trimTerminalSelection("a  \r\nb  \nc  \r\n")).toBe("a\r\nb\nc");
	});
	it("trims explicitly selected whitespace", () => {
		expect(trimTerminalSelection("   ")).toBe("");
		expect(trimTerminalSelection("  \r\n\t ")).toBe("\r\n\t");
	});
	it("preserves spaces inside an unwrapped logical line", () => {
		expect(trimTerminalSelection("first   continued  \nlast")).toBe(
			"first   continued\nlast",
		);
	});
});

describe("getTerminalSelectionForCopy", () => {
	it.each([
		0, 1, 2,
	])("trims complete logical lines in selection mode %i", (mode) => {
		expect(
			getTerminalSelectionForCopy(terminalStub("foo   \nbar  ", { mode })),
		).toBe("foo\nbar");
	});
	it("trims rectangular and unknown selections in both drag directions", () => {
		for (const mode of [3, 99]) {
			const terminal = terminalStub("a   \nlong", { mode });
			expect(getTerminalSelectionForCopy(terminal)).toBe("a\nlong");
			terminal.getSelectionPosition = () => ({
				start: { x: 9, y: 0 },
				end: { x: 1, y: 2 },
			});
			expect(getTerminalSelectionForCopy(terminal)).toBe("a\nlong");
		}
	});
	it("trims spaces at a partial selection boundary", () => {
		expect(
			getTerminalSelectionForCopy(
				terminalStub("foo   \nbar  ", { remainder: "next" }),
			),
		).toBe("foo\nbar");
	});
	it("trims spaces at the selected end before a soft-wrap continuation", () => {
		expect(
			getTerminalSelectionForCopy(
				terminalStub("foo   \nbar  ", { wrapped: true }),
			),
		).toBe("foo\nbar");
	});
	it("trims a single-line selection", () => {
		expect(
			getTerminalSelectionForCopy(terminalStub("abc  ", { singleLine: true })),
		).toBe("abc");
	});
	it("trims a single logical line spanning soft-wrapped rows", () => {
		expect(getTerminalSelectionForCopy(terminalStub("wrapped text  "))).toBe(
			"wrapped text",
		);
	});
	it("trims raw text when selection mode or bounds are unavailable", () => {
		const terminal = terminalStub("foo   \nbar  ");
		terminal.getSelectionPosition = () => undefined;
		expect(getTerminalSelectionForCopy(terminal)).toBe("foo\nbar");
		expect(
			getTerminalSelectionForCopy({
				getSelection: () => "foo   \nbar  ",
			} as XTerm),
		).toBe("foo\nbar");
	});
});

describe("installTerminalCopyHandler", () => {
	it("overwrites xterm's earlier raw copy and removes its listener on disposal", () => {
		const terminal = terminalStub("foo   \nbar  ");
		const data = new Map<string, string>();
		const event = () =>
			copyEvent({
				setData: (type: string, text: string) => data.set(type, text),
			});
		terminal.element?.addEventListener("copy", (event) => {
			(event as ClipboardEvent).clipboardData?.setData(
				"text/plain",
				terminal.getSelection(),
			);
			event.preventDefault();
		});
		const dispose = installTerminalCopyHandler(terminal);
		const first = event();
		terminal.element?.dispatchEvent(first);
		expect(first.defaultPrevented).toBe(true);
		expect(data.get("text/plain")).toBe("foo\nbar");
		dispose();
		terminal.element?.dispatchEvent(event());
		expect(data.get("text/plain")).toBe("foo   \nbar  ");
	});
	it("leaves copy events alone with no selection", () => {
		const terminal = terminalStub("");
		const write = mock(async () => {});
		installTerminalCopyHandler(terminal, write);
		const event = copyEvent();
		terminal.element?.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
		expect(write).not.toHaveBeenCalled();
	});
	it("clears the clipboard for a whitespace-only selection", () => {
		const terminal = terminalStub("   ");
		const setData = mock(() => {});
		installTerminalCopyHandler(terminal);
		terminal.element?.dispatchEvent(copyEvent({ setData }));
		expect(setData).toHaveBeenCalledWith("text/plain", "");
	});
	it("clears the clipboard when selected empty cells have no raw text", () => {
		const terminal = terminalStub("");
		terminal.hasSelection = () => true;
		const setData = mock(() => {});
		installTerminalCopyHandler(terminal);
		terminal.element?.dispatchEvent(copyEvent({ setData }));
		expect(setData).toHaveBeenCalledWith("text/plain", "");
	});

	it("uses the explicit writer when xterm has already canceled an event without clipboardData", () => {
		const terminal = terminalStub("foo   \nbar  ");
		terminal.element?.addEventListener("copy", (event) =>
			event.preventDefault(),
		);
		const write = mock(async () => {});
		installTerminalCopyHandler(terminal, write);
		const event = copyEvent();
		terminal.element?.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		expect(write).toHaveBeenCalledWith("foo\nbar");
	});
	it("falls back when event clipboard writes throw", () => {
		const terminal = terminalStub("foo\nbar");
		const write = mock(async () => {});
		installTerminalCopyHandler(terminal, write);
		terminal.element?.dispatchEvent(
			copyEvent({
				setData: () => {
					throw new Error("denied");
				},
			}),
		);
		expect(write).toHaveBeenCalledWith("foo\nbar");
	});
	it("reports failed writes and leaves the selection available to retry", async () => {
		const terminal = terminalStub("foo\nbar");
		const error = new Error("native clipboard failed");
		const log = spyOn(console, "error").mockImplementation(() => {});
		try {
			installTerminalCopyHandler(terminal, async () => {
				throw error;
			});
			terminal.element?.dispatchEvent(copyEvent());
			await Promise.resolve();
			expect(log).toHaveBeenCalledWith(
				"[terminal] Failed to copy selection",
				error,
			);
			expect(terminal.getSelection()).toBe("foo\nbar");
		} finally {
			log.mockRestore();
		}
	});
});
