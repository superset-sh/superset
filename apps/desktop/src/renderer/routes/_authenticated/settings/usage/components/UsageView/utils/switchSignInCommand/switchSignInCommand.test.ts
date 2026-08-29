import { describe, expect, it } from "bun:test";
import { switchSignInCommand } from "./switchSignInCommand";

describe("switchSignInCommand", () => {
	it("runs the CLI bare for the default claude login", () => {
		expect(switchSignInCommand({ agent: "claude", selection: null })).toBe(
			"claude auth login",
		);
	});

	it("quotes the absolute config dir for a claude profile", () => {
		expect(
			switchSignInCommand({
				agent: "claude",
				selection: "/Users/kietho/.claude-work",
			}),
		).toBe("CLAUDE_CONFIG_DIR=/Users/kietho/.claude-work claude auth login");
	});

	it("keeps dirs with spaces pasteable", () => {
		expect(
			switchSignInCommand({
				agent: "claude",
				selection: "/Users/kietho/.config/claude work",
			}),
		).toBe(
			"CLAUDE_CONFIG_DIR='/Users/kietho/.config/claude work' claude auth login",
		);
	});

	it("uses codex login with a CODEX_HOME override for non-default homes", () => {
		expect(switchSignInCommand({ agent: "codex", selection: null })).toBe(
			"codex login",
		);
		expect(
			switchSignInCommand({
				agent: "codex",
				selection: "/Users/kietho/.codex-work",
			}),
		).toBe("CODEX_HOME=/Users/kietho/.codex-work codex login");
	});

	it("neutralizes command substitution in the config dir", () => {
		expect(
			switchSignInCommand({
				agent: "claude",
				selection: "/tmp/$(rm -rf ~)",
			}),
		).toBe("CLAUDE_CONFIG_DIR='/tmp/$(rm -rf ~)' claude auth login");
	});

	it("neutralizes backticks in the config dir", () => {
		expect(
			switchSignInCommand({
				agent: "codex",
				selection: "/tmp/`whoami`",
			}),
		).toBe("CODEX_HOME='/tmp/`whoami`' codex login");
	});

	it("escapes an embedded single quote in the config dir", () => {
		expect(
			switchSignInCommand({
				agent: "claude",
				selection: "/tmp/it's-a-dir",
			}),
		).toBe("CLAUDE_CONFIG_DIR='/tmp/it'\\''s-a-dir' claude auth login");
	});

	it("neutralizes a double quote in the config dir", () => {
		expect(
			switchSignInCommand({
				agent: "claude",
				selection: '/tmp/"; rm -rf ~; echo "',
			}),
		).toBe(`CLAUDE_CONFIG_DIR='/tmp/"; rm -rf ~; echo "' claude auth login`);
	});
});
