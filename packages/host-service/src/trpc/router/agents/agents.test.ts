import { describe, expect, it } from "bun:test";
import { buildAgentCommandString } from "./agents";

const argvConfig = {
	id: "00000000-0000-0000-0000-000000000001",
	presetId: "claude",
	label: "Claude",
	command: "claude",
	args: ["--dangerously-skip-permissions"],
	promptTransport: "argv" as const,
	promptArgs: [],
	env: {},
};

const stdinConfig = {
	id: "00000000-0000-0000-0000-000000000002",
	presetId: "amp",
	label: "Amp",
	command: "amp",
	args: [],
	promptTransport: "stdin" as const,
	promptArgs: [],
	env: {},
};

describe("buildAgentCommandString", () => {
	it("is unchanged when no model args are given", () => {
		expect(buildAgentCommandString(argvConfig, "do the thing")).toBe(
			"'claude' '--dangerously-skip-permissions' 'do the thing'",
		);
	});

	it("inserts model args between base args and the prompt (argv transport)", () => {
		expect(
			buildAgentCommandString(argvConfig, "do the thing", [
				"--model",
				"sonnet",
			]),
		).toBe(
			"'claude' '--dangerously-skip-permissions' '--model' 'sonnet' 'do the thing'",
		);
	});

	it("inserts model args before the heredoc (stdin transport)", () => {
		expect(
			buildAgentCommandString(stdinConfig, "do the thing", [
				"--model",
				"sonnet",
			]),
		).toBe(
			"'amp' '--model' 'sonnet' <<'SUPERSET_PROMPT'\ndo the thing\nSUPERSET_PROMPT",
		);
	});

	it("shell-quotes hostile model values", () => {
		expect(
			buildAgentCommandString(argvConfig, "p", ["--model", "x'; rm -rf /"]),
		).toBe(
			"'claude' '--dangerously-skip-permissions' '--model' 'x'\\''; rm -rf /' 'p'",
		);
	});

	it("strips escape sequences and control chars from the prompt (argv transport)", () => {
		expect(
			buildAgentCommandString(argvConfig, "fix \x1b[31mred\x1b[0m bug\x07"),
		).toBe("'claude' '--dangerously-skip-permissions' 'fix [31mred[0m bug'");
	});

	it("normalizes CR to LF and keeps tabs (stdin transport)", () => {
		expect(buildAgentCommandString(stdinConfig, "line1\r\nline2\r\tend")).toBe(
			"'amp' <<'SUPERSET_PROMPT'\nline1\nline2\n\tend\nSUPERSET_PROMPT",
		);
	});

	it("resolves heredoc delimiter collisions created by sanitization", () => {
		// The delimiter line only appears after control chars are stripped; the
		// collision scan must run on the sanitized prompt or the heredoc would
		// terminate early and execute the remainder as shell input.
		expect(
			buildAgentCommandString(stdinConfig, "SUPERSET\x07_PROMPT\nrm -rf /"),
		).toBe(
			"'amp' <<'SUPERSET_PROMPT_1'\nSUPERSET_PROMPT\nrm -rf /\nSUPERSET_PROMPT_1",
		);
	});
});
