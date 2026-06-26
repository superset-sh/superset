import { describe, expect, it } from "bun:test";
import { stripTerminalQueryResponses } from "./terminal-query-response-filter";

describe("stripTerminalQueryResponses", () => {
	it("strips DA1 (Primary Device Attributes) responses", () => {
		// The canonical response from the issue: `^[[?62;4;9;22c`.
		expect(stripTerminalQueryResponses("\x1b[?62;4;9;22c")).toBe("");
		expect(stripTerminalQueryResponses("\x1b[?1;2c")).toBe("");
		expect(stripTerminalQueryResponses("\x1b[?c")).toBe("");
	});

	it("strips DA2 (Secondary Device Attributes) responses", () => {
		expect(stripTerminalQueryResponses("\x1b[>0;276;0c")).toBe("");
		expect(stripTerminalQueryResponses("\x1b[>c")).toBe("");
	});

	it("strips DSR status and cursor-position responses", () => {
		expect(stripTerminalQueryResponses("\x1b[0n")).toBe("");
		expect(stripTerminalQueryResponses("\x1b[3n")).toBe("");
		expect(stripTerminalQueryResponses("\x1b[24;80R")).toBe("");
	});

	it("strips OSC 10/11 color query responses", () => {
		expect(stripTerminalQueryResponses("\x1b]11;rgb:0000/0000/0000\x07")).toBe(
			"",
		);
		expect(
			stripTerminalQueryResponses("\x1b]10;rgb:ffff/ffff/ffff\x1b\\"),
		).toBe("");
	});

	it("strips DCS replies (XTVERSION, tertiary DA)", () => {
		expect(stripTerminalQueryResponses("\x1bP>|xterm(366)\x1b\\")).toBe("");
		expect(stripTerminalQueryResponses("\x1bP!|00000000\x1b\\")).toBe("");
	});

	it("preserves user-typed CSI sequences (arrow keys, etc.)", () => {
		// Arrow keys, home/end, function keys — these are legitimate input.
		expect(stripTerminalQueryResponses("\x1b[A")).toBe("\x1b[A");
		expect(stripTerminalQueryResponses("\x1b[B")).toBe("\x1b[B");
		expect(stripTerminalQueryResponses("\x1b[H")).toBe("\x1b[H");
		expect(stripTerminalQueryResponses("\x1b[1;5A")).toBe("\x1b[1;5A");
		expect(stripTerminalQueryResponses("\x1b[15~")).toBe("\x1b[15~");
	});

	it("preserves plain text", () => {
		expect(stripTerminalQueryResponses("echo hello\n")).toBe("echo hello\n");
		expect(stripTerminalQueryResponses("")).toBe("");
	});

	it("strips responses embedded in a larger payload", () => {
		expect(stripTerminalQueryResponses("before\x1b[?62;4;9;22cafter")).toBe(
			"beforeafter",
		);
	});

	it("strips multiple responses in one payload", () => {
		const input = "\x1b[?62;4;9;22c\x1b[>0;276;0c\x1b[24;80R";
		expect(stripTerminalQueryResponses(input)).toBe("");
	});
});
