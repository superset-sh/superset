import { describe, expect, it } from "bun:test";
import { switchSignInCommand } from "./switchSignInCommand";

describe("switchSignInCommand", () => {
	it("runs the CLI bare for the default claude login", () => {
		expect(switchSignInCommand({ provider: "claude", selection: null })).toBe(
			"claude auth login",
		);
	});

	it("quotes the absolute config dir for a claude profile", () => {
		expect(
			switchSignInCommand({
				provider: "claude",
				selection: "/Users/kietho/.claude-work",
			}),
		).toBe('CLAUDE_CONFIG_DIR="/Users/kietho/.claude-work" claude auth login');
	});

	it("keeps dirs with spaces pasteable", () => {
		expect(
			switchSignInCommand({
				provider: "claude",
				selection: "/Users/kietho/.config/claude work",
			}),
		).toBe(
			'CLAUDE_CONFIG_DIR="/Users/kietho/.config/claude work" claude auth login',
		);
	});

	it("uses codex login with a CODEX_HOME override for non-default homes", () => {
		expect(switchSignInCommand({ provider: "codex", selection: null })).toBe(
			"codex login",
		);
		expect(
			switchSignInCommand({
				provider: "codex",
				selection: "/Users/kietho/.codex-work",
			}),
		).toBe('CODEX_HOME="/Users/kietho/.codex-work" codex login');
	});
});
