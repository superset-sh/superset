import { describe, expect, it } from "bun:test";
import { renderTerminalSnapshot } from "./terminal-snapshot";

function render(data: string, options: { cols?: number; lines?: number } = {}) {
	return renderTerminalSnapshot({
		data: Buffer.from(data),
		cols: options.cols ?? 80,
		rows: 24,
		lines: options.lines ?? 120,
	});
}

describe("renderTerminalSnapshot", () => {
	it("renders ANSI state as plain text and removes unused viewport rows", () => {
		expect(render("first\r\n\x1b[31mred\x1b[0m\r\nlast")).toBe(
			"first\nred\nlast",
		);
	});

	it("joins wrapped physical rows into logical lines", () => {
		expect(render("abcdefgh\r\nlast", { cols: 5 })).toBe("abcdefgh\nlast");
	});

	it("returns only the requested tail lines", () => {
		expect(render("one\r\ntwo\r\nthree", { lines: 2 })).toBe("two\nthree");
	});

	it("reflects cursor rewrites instead of returning an append-only transcript", () => {
		expect(render("progress 1\rprogress 2")).toBe("progress 2");
	});

	it("enforces the public line cap", () => {
		expect(() =>
			renderTerminalSnapshot({
				data: Buffer.alloc(0),
				cols: 80,
				rows: 24,
				lines: 1001,
			}),
		).toThrow("1 to 1000");
	});
});
