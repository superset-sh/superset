import { describe, expect, it } from "bun:test";
import {
	buildPromptCommandString,
	sanitizePromptForPty,
} from "./agent-prompt-launch";

describe("sanitizePromptForPty", () => {
	it("strips C0 controls, DEL, and C1 controls at range boundaries", () => {
		expect(
			sanitizePromptForPty("a\x00b\x08c\x0bd\x0ce\x0ef\x1fg\x7fh\x80i\x9fj"),
		).toBe("abcdefghij");
	});

	it("removes ANSI CSI and OSC sequences whole, not just the lead byte", () => {
		expect(sanitizePromptForPty("fix \x1b[31mred\x1b[0m bug")).toBe(
			"fix red bug",
		);
		expect(sanitizePromptForPty("\x1b]0;title\x07before \x9b1mafter")).toBe(
			"before after",
		);
	});

	it("keeps text after an unterminated OSC, stripping only the lead byte", () => {
		expect(sanitizePromptForPty("hello \x1b]world more text")).toBe(
			"hello ]world more text",
		);
	});

	it("expands tabs to spaces so they can't fire shell completion", () => {
		expect(sanitizePromptForPty("if x:\n\treturn\tearly")).toBe(
			"if x:\n    return    early",
		);
	});

	it("keeps newlines and non-ASCII text", () => {
		expect(sanitizePromptForPty("line1\nline2 émoji 🎉 中文")).toBe(
			"line1\nline2 émoji 🎉 中文",
		);
	});

	it("normalizes CR variants to LF", () => {
		expect(sanitizePromptForPty("a\r\nb\rc\r\r\nd\r")).toBe("a\nb\nc\n\nd\n");
	});

	it("is idempotent", () => {
		const once = sanitizePromptForPty("x\x1b[31m\r\n\ty");
		expect(sanitizePromptForPty(once)).toBe(once);
	});

	it("returns an empty string for an all-control-character prompt", () => {
		expect(sanitizePromptForPty("\x1b\x07\x00")).toBe("");
	});
});

describe("buildPromptCommandString", () => {
	it("resolves heredoc delimiter collisions created by sanitization", () => {
		// The prompt only contains the delimiter after control chars are
		// stripped. If sanitization ever ran after delimiter resolution, this
		// prompt would terminate the heredoc early and the remainder would be
		// executed as shell input.
		const command = buildPromptCommandString({
			command: "amp",
			transport: "stdin",
			prompt: "SUPERSET_PROMPT\x07_1234\nrm -rf /",
			randomId: "1234",
		});

		expect(command).toBe(
			"amp <<'SUPERSET_PROMPT_1234_X'\nSUPERSET_PROMPT_1234\nrm -rf /\nSUPERSET_PROMPT_1234_X",
		);
	});
});
