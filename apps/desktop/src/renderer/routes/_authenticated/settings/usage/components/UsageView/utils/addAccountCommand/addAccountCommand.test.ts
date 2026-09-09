import { describe, expect, it } from "bun:test";
import { addAccountCommand } from "./addAccountCommand";

describe("addAccountCommand", () => {
	it("runs the plain provider login for subscription profiles", () => {
		expect(addAccountCommand("claude", "work", "subscription")).toBe(
			'CLAUDE_CONFIG_DIR="$HOME/.claude-work" claude auth login',
		);
		expect(addAccountCommand("codex", "work", "subscription")).toBe(
			'mkdir -p "$HOME/.codex-work" && CODEX_HOME="$HOME/.codex-work" codex login',
		);
	});

	it("signs Claude into the Console and marks the dir only after success", () => {
		expect(addAccountCommand("claude", "api", "api_key")).toBe(
			'mkdir -p "$HOME/.claude-api" && CLAUDE_CONFIG_DIR="$HOME/.claude-api" claude auth login --console && printf claude > "$HOME/.claude-api"/.superset-api-billing',
		);
	});

	it("prompts for the Codex key with echo off and pipes it on stdin", () => {
		const command = addAccountCommand("codex", "api", "api_key");
		expect(command).toBe(
			`mkdir -p "$HOME/.codex-api" && printf 'OpenAI API key: ' && read -rs OPENAI_KEY && echo && printf '%s' "$OPENAI_KEY" | CODEX_HOME="$HOME/.codex-api" codex login --with-api-key && printf codex > "$HOME/.codex-api"/.superset-api-billing; unset OPENAI_KEY`,
		);
		// The marker must follow the login's own exit status, not the unset.
		expect(command.indexOf("printf codex")).toBeLessThan(
			command.indexOf("unset"),
		);
		expect(command).not.toContain("\n");
	});
});
