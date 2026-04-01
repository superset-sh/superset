import { describe, expect, test } from "bun:test";
import type { ResolvedAgentConfig } from "shared/utils/agent-settings";
import { buildAgentFieldPatch } from "./agent-card.utils";

const BUILTIN_TERMINAL_PRESET: ResolvedAgentConfig = {
	id: "claude",
	source: "builtin",
	kind: "terminal",
	label: "Claude Code",
	command: "claude",
	promptCommand: "claude --print",
	promptTransport: "argv",
	taskPromptTemplate: "Task {{slug}}",
	enabled: true,
	overriddenFields: [],
};

const CUSTOM_TERMINAL_PRESET: ResolvedAgentConfig = {
	id: "custom:team-agent",
	source: "user",
	kind: "terminal",
	label: "Team Agent",
	command: "team-agent",
	promptCommand: "team-agent --prompt",
	promptTransport: "argv",
	taskPromptTemplate: "Task {{slug}}",
	enabled: true,
	overriddenFields: [],
};

describe("buildAgentFieldPatch", () => {
	test("allows clearing the prompt command for custom terminal agents", () => {
		expect(
			buildAgentFieldPatch({
				preset: CUSTOM_TERMINAL_PRESET,
				field: "promptCommand",
				value: "   ",
			}),
		).toEqual({
			patch: {
				promptCommand: "",
			},
		});
	});

	test("keeps prompt command required for builtin terminal agents", () => {
		expect(
			buildAgentFieldPatch({
				preset: BUILTIN_TERMINAL_PRESET,
				field: "promptCommand",
				value: "   ",
			}),
		).toEqual({
			error: "Prompt command is required for terminal agents.",
		});
	});
});
