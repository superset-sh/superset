import { describe, expect, it } from "bun:test";
import { switchSignInCommand } from "./switchSignInCommand";

describe("switchSignInCommand", () => {
	it("runs the CLI bare for the default claude login", () => {
		expect(
			switchSignInCommand({
				agent: "claude",
				credentialKind: "subscription",
				selection: null,
			}),
		).toBe("claude auth login");
	});

	it("quotes the absolute config dir for a claude profile", () => {
		expect(
			switchSignInCommand({
				agent: "claude",
				credentialKind: "subscription",
				selection: "/Users/kietho/.claude-work",
			}),
		).toBe("CLAUDE_CONFIG_DIR=/Users/kietho/.claude-work claude auth login");
	});

	it("keeps dirs with spaces pasteable", () => {
		expect(
			switchSignInCommand({
				agent: "claude",
				credentialKind: "subscription",
				selection: "/Users/kietho/.config/claude work",
			}),
		).toBe(
			"CLAUDE_CONFIG_DIR='/Users/kietho/.config/claude work' claude auth login",
		);
	});

	it("uses codex login with a CODEX_HOME override for non-default homes", () => {
		expect(
			switchSignInCommand({
				agent: "codex",
				credentialKind: "subscription",
				selection: null,
			}),
		).toBe("codex login");
		expect(
			switchSignInCommand({
				agent: "codex",
				credentialKind: "subscription",
				selection: "/Users/kietho/.codex-work",
			}),
		).toBe("CODEX_HOME=/Users/kietho/.codex-work codex login");
	});

	it("neutralizes command substitution in the config dir", () => {
		expect(
			switchSignInCommand({
				agent: "claude",
				credentialKind: "subscription",
				selection: "/tmp/$(rm -rf ~)",
			}),
		).toBe("CLAUDE_CONFIG_DIR='/tmp/$(rm -rf ~)' claude auth login");
	});

	it("neutralizes backticks in the config dir", () => {
		expect(
			switchSignInCommand({
				agent: "codex",
				credentialKind: "subscription",
				selection: "/tmp/`whoami`",
			}),
		).toBe("CODEX_HOME='/tmp/`whoami`' codex login");
	});

	it("escapes an embedded single quote in the config dir", () => {
		expect(
			switchSignInCommand({
				agent: "claude",
				credentialKind: "subscription",
				selection: "/tmp/it's-a-dir",
			}),
		).toBe("CLAUDE_CONFIG_DIR='/tmp/it'\\''s-a-dir' claude auth login");
	});

	it("neutralizes a double quote in the config dir", () => {
		expect(
			switchSignInCommand({
				agent: "claude",
				credentialKind: "subscription",
				selection: '/tmp/"; rm -rf ~; echo "',
			}),
		).toBe(`CLAUDE_CONFIG_DIR='/tmp/"; rm -rf ~; echo "' claude auth login`);
	});

	it("keeps an API-billed profile on API billing and rewrites its marker", () => {
		expect(
			switchSignInCommand({
				agent: "claude",
				credentialKind: "api_key",
				selection: "/Users/kietho/.claude-api",
			}),
		).toBe(
			"CLAUDE_CONFIG_DIR=/Users/kietho/.claude-api claude auth login --console && printf claude > /Users/kietho/.claude-api/.superset-api-billing",
		);
		const codex = switchSignInCommand({
			agent: "codex",
			credentialKind: "api_key",
			selection: "/Users/kietho/.codex-api",
		});
		expect(codex).toContain("read -rs OPENAI_KEY");
		expect(codex).toContain(
			"CODEX_HOME=/Users/kietho/.codex-api codex login --with-api-key && printf codex > /Users/kietho/.codex-api/.superset-api-billing",
		);
	});

	it("marks the system-default Codex home wherever the CLI resolves it", () => {
		expect(
			switchSignInCommand({
				agent: "codex",
				credentialKind: "api_key",
				selection: null,
			}),
		).toContain(
			// biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion
			'CODEX_HOME="${CODEX_HOME:-$HOME/.codex}" codex login --with-api-key && printf codex > "${CODEX_HOME:-$HOME/.codex}"/.superset-api-billing',
		);
	});
});
