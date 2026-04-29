import { describe, expect, it } from "bun:test";
import {
	buildAgentFileCommand,
	buildAgentPromptCommand,
} from "./agent-command";

describe("buildAgentPromptCommand", () => {
	it("adds `--` before codex prompt payload", () => {
		const command = buildAgentPromptCommand({
			prompt: "- Only modified file: runtime.ts",
			randomId: "1234-5678",
			agent: "codex",
		});

		expect(command).toContain(
			"model_supports_reasoning_summaries=true --full-auto -- \"$(cat <<'SUPERSET_PROMPT_12345678'",
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
			"claude --permission-mode acceptEdits \"$(cat <<'SUPERSET_PROMPT_abcdefgh'",
		);
	});

	it("uses Amp interactive stdin mode for prompt launches", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "amp-1234",
			agent: "amp",
		});

		expect(command).toStartWith("amp <<'SUPERSET_PROMPT_amp1234'");
		expect(command).not.toContain("amp -x");
	});

	it("uses Amp interactive stdin mode for file launches", () => {
		const command = buildAgentFileCommand({
			filePath: ".superset/task-demo.md",
			agent: "amp",
		});

		expect(command).toBe("amp < '.superset/task-demo.md'");
	});

	it("uses pi interactive mode for prompt launches", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "pi-1234",
			agent: "pi",
		});

		expect(command).toStartWith("pi \"$(cat <<'SUPERSET_PROMPT_pi1234'");
		expect(command).not.toContain("pi -p");
	});

	it("passes copilot prompts via --prompt flag, not as positional", () => {
		// Repro for #3862: `copilot -i ... "<prompt>"` errors with
		// "Expected 0 arguments but got 1." because interactive mode does
		// not accept a positional prompt. The prompt must be passed via
		// the --prompt flag.
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "copilot-1234",
			agent: "copilot",
		});

		expect(command).not.toMatch(/\bcopilot\b[^"]*\s-i\b/);
		expect(command).toStartWith(
			"copilot --allow-tool=write --prompt \"$(cat <<'SUPERSET_PROMPT_copilot1234'",
		);
	});
});
