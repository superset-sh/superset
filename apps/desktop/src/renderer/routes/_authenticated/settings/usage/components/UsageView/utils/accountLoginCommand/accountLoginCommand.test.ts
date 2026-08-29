import { describe, expect, it } from "bun:test";
import { accountLoginCommand } from "./accountLoginCommand";

describe("accountLoginCommand", () => {
	it("uses the normal provider login for subscription profiles", () => {
		expect(accountLoginCommand("claude", "work", "subscription")).toBe(
			'CLAUDE_CONFIG_DIR="$HOME/.claude-work" claude auth login',
		);
		expect(accountLoginCommand("codex", "work", "subscription")).toBe(
			'mkdir -p "$HOME/.codex-work" && CODEX_HOME="$HOME/.codex-work" codex login',
		);
	});

	it("uses Anthropic Console auth and marks the completed profile", () => {
		const command = accountLoginCommand("claude", "api", "api_key");
		expect(command).toContain("claude auth login --console");
		expect(command).toEndWith(
			'touch "$HOME/.claude-api/.superset-api-billing"',
		);
	});

	it("reads a Codex key with terminal echo disabled and pipes it on stdin", () => {
		const command = accountLoginCommand("codex", "api", "api_key");
		expect(command).toContain("stty -echo");
		expect(command).toContain("codex login --with-api-key");
		expect(command).toContain("printf '%s' \"$SUPERSET_OPENAI_API_KEY\" |");
		expect(command).toEndWith('touch "$HOME/.codex-api/.superset-api-billing"');
		expect(command).not.toContain("sk-");
	});
});
