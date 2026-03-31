import { describe, expect, it } from "bun:test";
import { buildAgentPromptCommand } from "./agent-command";

describe("buildAgentPromptCommand", () => {
	it("adds `--` before codex prompt payload", () => {
		const command = buildAgentPromptCommand({
			prompt: "- Only modified file: runtime.ts",
			randomId: "1234-5678",
			agent: "codex",
		});

		expect(command).toContain(
			"model_supports_reasoning_summaries=true -- \"$(cat <<'SUPERSET_PROMPT_12345678'",
		);
		expect(command).toContain("- Only modified file: runtime.ts");
	});

	it("adds `--` before claude prompt payload", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "abcd-efgh",
			agent: "claude",
		});

		expect(command).toStartWith(
			"claude --dangerously-skip-permissions -- \"$(cat <<'SUPERSET_PROMPT_abcdefgh'",
		);
	});

	it("adds `--` before pi prompt payload", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "pi-1234",
			agent: "pi",
		});

		expect(command).toStartWith("pi -- \"$(cat <<'SUPERSET_PROMPT_pi1234'");
		expect(command).not.toContain("pi -p");
	});

	it("does not break when prompt starts with dashes", () => {
		const command = buildAgentPromptCommand({
			prompt: "---\ntitle: My Doc\n---\nContent here",
			randomId: "dash-test",
			agent: "claude",
		});

		expect(command).toContain('-- "$(cat');
		expect(command).toContain("---\ntitle: My Doc\n---\nContent here");
	});

	it("places gemini --yolo flag before `--` separator", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "gem-1234",
			agent: "gemini",
		});

		expect(command).toStartWith(
			"gemini --yolo -- \"$(cat <<'SUPERSET_PROMPT_gem1234'",
		);
		expect(command).not.toContain(')" --yolo');
	});

	it("places copilot --yolo flag before `--` separator", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "cop-1234",
			agent: "copilot",
		});

		expect(command).toStartWith(
			"copilot -i --allow-all --yolo -- \"$(cat <<'SUPERSET_PROMPT_cop1234'",
		);
	});
});
