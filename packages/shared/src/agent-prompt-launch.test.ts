import { describe, expect, it } from "bun:test";
import {
	buildFishPromptCommandString,
	buildPromptCommandString,
	parsePromptHeredocCommand,
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

describe("parsePromptHeredocCommand", () => {
	const trickyPrompt = "line 'one'\n$HOME `pwd` \"two\"\n\nlast";

	it("round-trips the argv transport, prompt bytes exact", () => {
		const built = buildPromptCommandString({
			command: "claude --model opus",
			suffix: "--verbose",
			transport: "argv",
			prompt: trickyPrompt,
			randomId: "abc123",
		});
		expect(parsePromptHeredocCommand(built)).toEqual({
			transport: "argv",
			command: "claude --model opus",
			prompt: trickyPrompt,
			suffix: "--verbose",
		});
	});

	it("round-trips the argv transport without a suffix", () => {
		const built = buildPromptCommandString({
			command: "claude",
			transport: "argv",
			prompt: trickyPrompt,
			randomId: "abc123",
		});
		expect(parsePromptHeredocCommand(built)).toEqual({
			transport: "argv",
			command: "claude",
			prompt: trickyPrompt,
			suffix: undefined,
		});
	});

	it("round-trips the stdin transport", () => {
		const built = buildPromptCommandString({
			command: "amp",
			suffix: "--dangerous",
			transport: "stdin",
			prompt: trickyPrompt,
			randomId: "abc123",
		});
		expect(parsePromptHeredocCommand(built)).toEqual({
			transport: "stdin",
			command: "amp --dangerous",
			prompt: trickyPrompt,
		});
	});

	it("round-trips a collision-extended delimiter (_X runs)", () => {
		const prompt = "SUPERSET_PROMPT_1234\nbody";
		const built = buildPromptCommandString({
			command: "amp",
			transport: "stdin",
			prompt,
			randomId: "1234",
		});
		expect(parsePromptHeredocCommand(built)?.prompt).toBe(prompt);
	});

	it("returns null for plain commands and foreign heredocs", () => {
		expect(parsePromptHeredocCommand("claude --resume abc")).toBeNull();
		expect(parsePromptHeredocCommand("cat <<'EOF'\nhello\nEOF")).toBeNull();
	});
});

describe("buildFishPromptCommandString", () => {
	it("argv transport reads the staged file via string collect and self-deletes", () => {
		expect(
			buildFishPromptCommandString({
				command: "claude",
				suffix: "--verbose",
				transport: "argv",
				promptFilePath: "/tmp/superset-launch-prompt-x.txt",
			}),
		).toBe(
			"claude (begin; cat '/tmp/superset-launch-prompt-x.txt'; command rm -f -- '/tmp/superset-launch-prompt-x.txt'; end | string collect --allow-empty) --verbose",
		);
	});

	it("stdin transport redirects the staged file and unlinks it after open", () => {
		expect(
			buildFishPromptCommandString({
				command: "amp --dangerous",
				transport: "stdin",
				promptFilePath: "/tmp/p.txt",
			}),
		).toBe(
			"begin; command rm -f -- '/tmp/p.txt'; amp --dangerous; end < '/tmp/p.txt'",
		);
	});
});
