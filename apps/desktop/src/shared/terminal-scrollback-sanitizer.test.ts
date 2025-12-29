import { describe, expect, it } from "bun:test";
import { sanitizeTerminalScrollback } from "./terminal-scrollback-sanitizer";

describe("sanitizeTerminalScrollback", () => {
	it("preserves DA1 request sequences (ESC[c)", () => {
		const input = `before\n\x1b[c\nafter`;
		expect(sanitizeTerminalScrollback(input)).toBe(input);
	});

	it("preserves DA2 request sequences (ESC[>c)", () => {
		const input = `before\n\x1b[>c\nafter`;
		expect(sanitizeTerminalScrollback(input)).toBe(input);
	});

	it("removes caret-escaped DA responses", () => {
		const input = `before\n^[[>0;276;0c\nafter`;
		expect(sanitizeTerminalScrollback(input)).toBe(`before\n\nafter`);
	});

	it("removes raw DA responses", () => {
		const input = `before\n\x1b[>0;276;0c\nafter`;
		expect(sanitizeTerminalScrollback(input)).toBe(`before\n\nafter`);
	});

	it("removes caret-escaped SGR mouse reports", () => {
		const input = `start ^[[<35;90;43M end`;
		expect(sanitizeTerminalScrollback(input)).toBe(`start  end`);
	});

	it("removes raw SGR mouse reports", () => {
		const input = `start \x1b[<35;90;43M end`;
		expect(sanitizeTerminalScrollback(input)).toBe(`start  end`);
	});

	it("removes leaked DA payloads without CSI prefix", () => {
		const input = `x 0;276;0c y`;
		expect(sanitizeTerminalScrollback(input)).toBe(`x  y`);
	});

	it("removes long runs of leaked mouse payloads", () => {
		const input = `pfx 35;90;43M35;88;43M35;86;43M sfx`;
		expect(sanitizeTerminalScrollback(input)).toBe(`pfx  sfx`);
	});

	it("preserves SGR styling sequences", () => {
		const input = `\x1b[35;90;43mhello\x1b[0m`;
		expect(sanitizeTerminalScrollback(input)).toBe(input);
	});
});
