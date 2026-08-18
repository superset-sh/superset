import { describe, expect, it } from "bun:test";
import { signInCommand } from "./signInCommand";

describe("signInCommand", () => {
	it("uses the plain login command for the default claude login", () => {
		expect(
			signInCommand({
				provider: "claude",
				selection: null,
				sourceLabel: "Keychain",
			}),
		).toBe("claude /login");
	});

	it("injects CLAUDE_CONFIG_DIR for a profile-dir claude login", () => {
		expect(
			signInCommand({
				provider: "claude",
				selection: "/Users/kietho/.claude-work",
				sourceLabel: "~/.claude-work",
			}),
		).toBe("CLAUDE_CONFIG_DIR=~/.claude-work claude /login");
	});

	it("falls back to the absolute selection when the label is not a path", () => {
		expect(
			signInCommand({
				provider: "claude",
				selection: "/opt/claude-profiles/work",
				sourceLabel: "Work profile",
			}),
		).toBe("CLAUDE_CONFIG_DIR=/opt/claude-profiles/work claude /login");
	});

	it("uses codex with a CODEX_HOME override for non-default homes", () => {
		expect(
			signInCommand({
				provider: "codex",
				selection: null,
				sourceLabel: "~/.codex",
			}),
		).toBe("codex");
		expect(
			signInCommand({
				provider: "codex",
				selection: "/Users/kietho/.codex-work",
				sourceLabel: "~/.codex-work",
			}),
		).toBe("CODEX_HOME=~/.codex-work codex");
	});
});
