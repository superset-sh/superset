import { describe, expect, it } from "bun:test";
import { isCodexCommand } from "./isCodexCommand";

describe("isCodexCommand", () => {
	it("returns false for undefined / empty commands", () => {
		expect(isCodexCommand(undefined)).toBe(false);
		expect(isCodexCommand("")).toBe(false);
	});

	it("returns true for a bare codex invocation", () => {
		expect(isCodexCommand("codex")).toBe(true);
	});

	it("returns true for codex with arguments", () => {
		expect(isCodexCommand("codex --resume")).toBe(true);
		expect(isCodexCommand("codex exec 'do thing'")).toBe(true);
	});

	it("returns true for codex run via an absolute path (e.g. the Superset wrapper)", () => {
		expect(isCodexCommand("/Users/foo/.superset/bin/codex --model gpt-5")).toBe(
			true,
		);
	});

	it("returns true when codex follows another binary on the same line", () => {
		expect(isCodexCommand("env FOO=1 codex")).toBe(true);
	});

	it("returns false for unrelated commands that contain the substring 'codex'", () => {
		expect(isCodexCommand("claude")).toBe(false);
		expect(isCodexCommand("opencode")).toBe(false);
		expect(isCodexCommand("vim codex.md")).toBe(false);
		expect(isCodexCommand("cat codex-history.log")).toBe(false);
	});
});
