import { describe, expect, test } from "bun:test";
import { resetTerminalRenderer } from "./renderer-reset";

function fakeTerminal(rows: number) {
	const refreshes: Array<[number, number]> = [];
	return {
		rows,
		refresh: (start: number, end: number) => {
			refreshes.push([start, end]);
		},
		refreshes,
	};
}

describe("resetTerminalRenderer", () => {
	test("clears the glyph atlas before repainting the viewport", () => {
		const terminal = fakeTerminal(40);
		const order: string[] = [];
		const renderer = {
			clearTextureAtlas: () => order.push("clear"),
		};

		resetTerminalRenderer(
			{
				rows: terminal.rows,
				refresh: (start, end) => {
					order.push(`refresh:${start}-${end}`);
				},
			},
			renderer,
		);

		// The atlas clear is what invalidates the renderer's cached model; a
		// refresh that lands first would be skipped cell-by-cell against it.
		expect(order).toEqual(["clear", "refresh:0-39"]);
	});

	test("repaints without an atlas when WebGL is unavailable", () => {
		const terminal = fakeTerminal(24);

		resetTerminalRenderer(terminal, null);

		expect(terminal.refreshes).toEqual([[0, 23]]);
	});

	test("survives a zero-row terminal", () => {
		const terminal = fakeTerminal(0);

		resetTerminalRenderer(terminal, null);

		expect(terminal.refreshes).toEqual([[0, 0]]);
	});
});
