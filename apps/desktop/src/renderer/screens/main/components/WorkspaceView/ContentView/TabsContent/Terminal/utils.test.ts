import { describe, expect, it, mock } from "bun:test";
import type { Terminal } from "@xterm/xterm";
import { captureTerminalViewport, restoreTerminalViewport } from "./utils";

function makeTerminal({
	baseY = 0,
	viewportY = 0,
}: {
	baseY?: number;
	viewportY?: number;
} = {}) {
	const scrollToBottom = mock(() => {});
	const scrollToLine = mock(() => {});

	const terminal = {
		buffer: {
			active: {
				baseY,
				viewportY,
			},
		},
		scrollToBottom,
		scrollToLine,
	} as unknown as Terminal;

	return {
		terminal,
		scrollToBottom,
		scrollToLine,
	};
}

describe("captureTerminalViewport", () => {
	it("captures the current viewport line and bottom state", () => {
		const { terminal } = makeTerminal({ baseY: 120, viewportY: 32 });

		expect(captureTerminalViewport(terminal)).toEqual({
			line: 32,
			wasAtBottom: false,
		});
	});

	it("marks the snapshot as bottom-aligned when viewport is at the end", () => {
		const { terminal } = makeTerminal({ baseY: 120, viewportY: 120 });

		expect(captureTerminalViewport(terminal)).toEqual({
			line: 120,
			wasAtBottom: true,
		});
	});
});

describe("restoreTerminalViewport", () => {
	it("returns to bottom when the snapshot was bottom-aligned", () => {
		const { terminal, scrollToBottom, scrollToLine } = makeTerminal({
			baseY: 200,
			viewportY: 200,
		});

		restoreTerminalViewport(terminal, {
			line: 200,
			wasAtBottom: true,
		});

		expect(scrollToBottom).toHaveBeenCalledTimes(1);
		expect(scrollToLine).not.toHaveBeenCalled();
	});

	it("restores the previous viewport line when the user was scrolled up", () => {
		const { terminal, scrollToBottom, scrollToLine } = makeTerminal({
			baseY: 200,
			viewportY: 120,
		});

		restoreTerminalViewport(terminal, {
			line: 120,
			wasAtBottom: false,
		});

		expect(scrollToLine).toHaveBeenCalledWith(120);
		expect(scrollToBottom).not.toHaveBeenCalled();
	});

	it("clamps restored lines to the current scrollback length", () => {
		const { terminal, scrollToLine } = makeTerminal({
			baseY: 80,
			viewportY: 20,
		});

		restoreTerminalViewport(terminal, {
			line: 140,
			wasAtBottom: false,
		});

		expect(scrollToLine).toHaveBeenCalledWith(80);
	});
});
