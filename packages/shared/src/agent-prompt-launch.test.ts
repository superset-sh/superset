import { describe, expect, it } from "bun:test";
import {
	applyEnvOverlay,
	buildFishArgvCommand,
	buildNuArgvCommand,
	buildPromptCommandString,
	getShellFamily,
	quoteFishString,
	quoteNuString,
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

describe("getShellFamily", () => {
	it("groups heredoc-capable shells as posix", () => {
		expect(getShellFamily("/bin/bash")).toBe("posix");
		expect(getShellFamily("/bin/zsh")).toBe("posix");
		expect(getShellFamily("/bin/sh")).toBe("posix");
		expect(getShellFamily("/usr/bin/ksh")).toBe("posix");
		expect(getShellFamily("/usr/bin/dash")).toBe("posix");
	});

	it("separates fish and nu, which need their own syntax", () => {
		expect(getShellFamily("/opt/homebrew/bin/fish")).toBe("fish");
		expect(getShellFamily("/opt/homebrew/bin/nu")).toBe("nu");
		expect(getShellFamily("/usr/local/bin/nushell")).toBe("nu");
	});

	it("reports unrecognized shells as unknown rather than assuming posix", () => {
		// Callers fall back to today's POSIX output for `unknown`, so a wrong
		// guess here would emit syntax the shell can't parse.
		expect(getShellFamily("/usr/bin/xonsh")).toBe("unknown");
		expect(getShellFamily("/usr/bin/elvish")).toBe("unknown");
		expect(getShellFamily("")).toBe("unknown");
	});

	it("handles bare names, Windows separators, and .exe suffixes", () => {
		expect(getShellFamily("bash")).toBe("posix");
		expect(getShellFamily("C:\\Program Files\\Git\\bin\\bash.exe")).toBe(
			"posix",
		);
		expect(getShellFamily("  /bin/ZSH  ")).toBe("posix");
	});
});

describe("quoteFishString", () => {
	it("escapes the two sequences fish decodes inside single quotes", () => {
		// Unlike bash, fish honors \\ and \' between single quotes, so leaving
		// them bare collapses backslash pairs before the agent sees them.
		expect(quoteFishString("a\\\\b")).toBe("'a\\\\\\\\b'");
		expect(quoteFishString("it's")).toBe("'it\\'s'");
	});

	it("leaves everything else untouched", () => {
		expect(quoteFishString('say "hi" $HOME `tick` 100%')).toBe(
			"'say \"hi\" $HOME `tick` 100%'",
		);
	});
});

describe("quoteNuString", () => {
	it("uses double quotes, since nu single quotes cannot express an apostrophe", () => {
		expect(quoteNuString("it's")).toBe('"it\'s"');
	});

	it("escapes backslashes before quotes so a literal \\n survives", () => {
		expect(quoteNuString("a\\\\b")).toBe('"a\\\\\\\\b"');
		expect(quoteNuString('say "hi"')).toBe('"say \\"hi\\""');
	});
});

describe("buildNuArgvCommand", () => {
	it("prefixes the command with ^ so nu runs the external binary", () => {
		// A quoted string in command position is a string literal to nu, not a
		// command: 'claude' 'prompt' fails with nu::parser::parse_mismatch.
		expect(buildNuArgvCommand(["claude", "--flag", "prompt"])).toBe(
			'^"claude" "--flag" "prompt"',
		);
	});

	it("returns an empty string for an empty argv", () => {
		expect(buildNuArgvCommand([])).toBe("");
	});
});

describe("buildFishArgvCommand", () => {
	it("quotes every argument with fish rules", () => {
		expect(buildFishArgvCommand(["claude", "--flag", "it's \\\\d"])).toBe(
			"'claude' '--flag' 'it\\'s \\\\\\\\d'",
		);
	});
});

describe("applyEnvOverlay", () => {
	it("returns the command unchanged when there is nothing to overlay", () => {
		expect(
			applyEnvOverlay({ env: {}, command: "'claude'", shellFamily: "posix" }),
		).toBe("'claude'");
	});

	it("emits POSIX assignments for posix and unknown shells", () => {
		expect(
			applyEnvOverlay({
				env: { API_KEY: "s3cret" },
				command: "'claude'",
				shellFamily: "posix",
			}),
		).toBe("API_KEY='s3cret' 'claude'");
	});

	it("quotes assignment values with fish rules under fish", () => {
		expect(
			applyEnvOverlay({
				env: { WINDOWS_PATH: "C:\\\\tmp" },
				command: "'claude'",
				shellFamily: "fish",
			}),
		).toBe("WINDOWS_PATH='C:\\\\\\\\tmp' 'claude'");
	});

	it("wraps nu commands in with-env instead of an assignment prefix", () => {
		// nu parses assignment values raw, so no quoting survives both `'` and
		// `"` in one value. Inside with-env they parse as ordinary nu strings.
		expect(
			applyEnvOverlay({
				env: { TOKEN: 'it\'s "quoted"' },
				command: '^"claude"',
				shellFamily: "nu",
			}),
		).toBe('with-env {"TOKEN": "it\'s \\"quoted\\""} { ^"claude" }');
	});
});
