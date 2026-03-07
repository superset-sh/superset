import { describe, expect, it } from "bun:test";
import { buildAgentPromptCommand } from "./agent-command";

describe("buildAgentPromptCommand", () => {
	it("adds `--` before codex prompt payload", () => {
		const command = buildAgentPromptCommand({
			prompt: "- Only modified file: runtime.ts",
			randomId: "1234-5678",
			agent: "codex",
		});

		expect(command).toContain("--dangerously-bypass-approvals-and-sandbox");
		expect(command).toContain('model_reasoning_summary="detailed"');
		expect(command).toContain(
			"model_supports_reasoning_summaries=true -- \"$(cat <<'SUPERSET_PROMPT_12345678'",
		);
		expect(command).toContain("- Only modified file: runtime.ts");
	});

	it("does not change non-codex commands", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "abcd-efgh",
			agent: "claude",
		});

		expect(command).toStartWith(
			"claude --dangerously-skip-permissions \"$(cat <<'SUPERSET_PROMPT_abcdefgh'",
		);
	});

	it("applies gemini yolo mode as suffix after prompt payload", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "gem-123",
			agent: "gemini",
		});

		expect(command).toStartWith("gemini \"$(cat <<'SUPERSET_PROMPT_gem123'");
		expect(command).toContain(')" --yolo');
	});
});
