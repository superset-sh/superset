import { describe, expect, it } from "bun:test";
import { stripTerminalQueryResponses } from "./query-response-filter";

describe("stripTerminalQueryResponses", () => {
	it("strips DA1 response (ESC[?...c)", () => {
		expect(stripTerminalQueryResponses("\x1b[?62;4;9;22c")).toBe("");
		expect(stripTerminalQueryResponses("\x1b[?1;2c")).toBe("");
	});

	it("strips DA2 response (ESC[>...c)", () => {
		expect(stripTerminalQueryResponses("\x1b[>0;276;0c")).toBe("");
	});

	it("strips DA3 response (ESC[=...c)", () => {
		expect(stripTerminalQueryResponses("\x1b[=0;0;0c")).toBe("");
	});

	it("strips cursor position report (CPR)", () => {
		expect(stripTerminalQueryResponses("\x1b[1;1R")).toBe("");
		expect(stripTerminalQueryResponses("\x1b[24;80R")).toBe("");
	});

	it("strips DSR status response (ESC[0n)", () => {
		expect(stripTerminalQueryResponses("\x1b[0n")).toBe("");
	});

	it("strips OSC 10/11/12 color responses with BEL terminator", () => {
		expect(stripTerminalQueryResponses("\x1b]10;rgb:eaea/e8e8/e6e6\x07")).toBe(
			"",
		);
		expect(stripTerminalQueryResponses("\x1b]11;rgb:1515/1111/1010\x07")).toBe(
			"",
		);
		expect(stripTerminalQueryResponses("\x1b]12;rgb:ffff/ffff/ffff\x07")).toBe(
			"",
		);
	});

	it("strips OSC 11 color response with ST terminator", () => {
		expect(
			stripTerminalQueryResponses("\x1b]11;rgb:1515/1111/1010\x1b\\"),
		).toBe("");
	});

	it("strips concatenated responses (#4041 leak shape)", () => {
		// delta sends OSC 11 + DA1 back-to-back; xterm.js may emit both
		// replies in a single onData call.
		const concatenated = "\x1b]11;rgb:1515/1111/1010\x1b\\\x1b[?62;4;9;22c";
		expect(stripTerminalQueryResponses(concatenated)).toBe("");
	});

	it("preserves arrow-key user input", () => {
		expect(stripTerminalQueryResponses("\x1b[A")).toBe("\x1b[A");
		expect(stripTerminalQueryResponses("\x1b[B")).toBe("\x1b[B");
		expect(stripTerminalQueryResponses("\x1b[C")).toBe("\x1b[C");
		expect(stripTerminalQueryResponses("\x1b[D")).toBe("\x1b[D");
	});

	it("preserves application-mode arrow keys (ESC O A..D)", () => {
		expect(stripTerminalQueryResponses("\x1bOA")).toBe("\x1bOA");
		expect(stripTerminalQueryResponses("\x1bOD")).toBe("\x1bOD");
	});

	it("preserves bracketed paste markers", () => {
		expect(stripTerminalQueryResponses("\x1b[200~hello\x1b[201~")).toBe(
			"\x1b[200~hello\x1b[201~",
		);
	});

	it("preserves bare ESC (e.g. user pressing Escape)", () => {
		expect(stripTerminalQueryResponses("\x1b")).toBe("\x1b");
	});

	it("preserves home/end/page-up keys (ending in ~ or H/F)", () => {
		expect(stripTerminalQueryResponses("\x1b[H")).toBe("\x1b[H");
		expect(stripTerminalQueryResponses("\x1b[F")).toBe("\x1b[F");
		expect(stripTerminalQueryResponses("\x1b[5~")).toBe("\x1b[5~");
		expect(stripTerminalQueryResponses("\x1b[6~")).toBe("\x1b[6~");
	});

	it("preserves SGR mouse reports (final M, has digits and semicolons)", () => {
		// Mouse SGR reports look like ESC[<button;col;row M — they end in 'M'
		// or 'm', not 'R'/'c'/'n', so they should pass through.
		expect(stripTerminalQueryResponses("\x1b[<0;10;20M")).toBe(
			"\x1b[<0;10;20M",
		);
		expect(stripTerminalQueryResponses("\x1b[<0;10;20m")).toBe(
			"\x1b[<0;10;20m",
		);
	});

	it("preserves plain text input", () => {
		expect(stripTerminalQueryResponses("hello world\n")).toBe("hello world\n");
		expect(stripTerminalQueryResponses("y\n")).toBe("y\n");
	});

	it("preserves user input mixed with arrow keys", () => {
		// e.g. user types "echo hi" then presses arrow up — irrelevant edge
		// case but exercises the no-match branch.
		expect(stripTerminalQueryResponses("echo hi\x1b[A")).toBe("echo hi\x1b[A");
	});

	it("strips a response embedded in plain text without losing the text", () => {
		// Defensive: if a response somehow concatenates with other input, the
		// non-response portion must survive intact.
		expect(stripTerminalQueryResponses("ls\x1b[1;1R\n")).toBe("ls\n");
	});

	it("returns input unchanged when no ESC is present", () => {
		expect(stripTerminalQueryResponses("plain text")).toBe("plain text");
		expect(stripTerminalQueryResponses("")).toBe("");
	});
});
