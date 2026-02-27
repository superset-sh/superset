import { describe, expect, test } from "bun:test";
import {
	AGENT_PRESET_COMMANDS,
	buildAgentCommand,
	buildAgentPromptCommand,
} from "./agent-command";

describe("AGENT_PRESET_COMMANDS", () => {
	// Regression test for https://github.com/supersetai/superset/issues/1898
	// model_reasoning_summary and model_supports_reasoning_summaries are not
	// supported by all models (e.g. gpt-5.3-codex-spark), causing API errors:
	// "Unsupported parameter: 'reasoning.summary' is not supported with the
	// 'gpt-5.3-codex-spark' model."
	test("codex preset does not include model_reasoning_summary flag", () => {
		const presets = AGENT_PRESET_COMMANDS.codex;
		for (const preset of presets) {
			expect(preset).not.toContain("model_reasoning_summary");
		}
	});

	test("codex preset does not include model_supports_reasoning_summaries flag", () => {
		const presets = AGENT_PRESET_COMMANDS.codex;
		for (const preset of presets) {
			expect(preset).not.toContain("model_supports_reasoning_summaries");
		}
	});
});

describe("buildAgentPromptCommand", () => {
	test("codex command does not include model_reasoning_summary", () => {
		const cmd = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "abc123",
			agent: "codex",
		});
		expect(cmd).not.toContain("model_reasoning_summary");
		expect(cmd).not.toContain("model_supports_reasoning_summaries");
	});
});

describe("buildAgentCommand", () => {
	test("codex command does not include model_reasoning_summary", () => {
		const cmd = buildAgentCommand({
			task: {
				id: "t1",
				slug: "task-1",
				title: "Test Task",
				description: "Do stuff",
				priority: "medium",
				statusName: "open",
				labels: [],
			},
			randomId: "abc123",
			agent: "codex",
		});
		expect(cmd).not.toContain("model_reasoning_summary");
		expect(cmd).not.toContain("model_supports_reasoning_summaries");
	});
});
