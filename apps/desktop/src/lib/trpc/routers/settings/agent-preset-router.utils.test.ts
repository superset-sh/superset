import { describe, expect, test } from "bun:test";
import { getBuiltinAgentDefinition } from "@superset/shared/agent-catalog";
import { TRPCError } from "@trpc/server";
import {
	normalizeAgentPresetPatch,
	updateAgentPresetInputSchema,
} from "./agent-preset-router.utils";

describe("updateAgentPresetInputSchema", () => {
	test("rejects empty patches", () => {
		const result = updateAgentPresetInputSchema.safeParse({
			id: "claude",
			patch: {},
		});

		expect(result.success).toBe(false);
	});
});

describe("normalizeAgentPresetPatch", () => {
	test("trims terminal fields and normalizes empty optional strings to null", () => {
		const patch = normalizeAgentPresetPatch({
			definition: getBuiltinAgentDefinition("claude"),
			patch: {
				label: "  Claude Custom  ",
				description: "  Custom description  ",
				command: "  claude-custom  ",
				promptCommand: "  claude-custom --prompt  ",
				promptCommandSuffix: "   ",
				taskPromptTemplate: "  Task {{slug}}  ",
			},
		});

		expect(patch).toEqual({
			label: "Claude Custom",
			description: "Custom description",
			command: "claude-custom",
			promptCommand: "claude-custom --prompt",
			promptCommandSuffix: null,
			taskPromptTemplate: "Task {{slug}}",
		});
	});

	test("normalizes empty chat model to null", () => {
		const patch = normalizeAgentPresetPatch({
			definition: getBuiltinAgentDefinition("superset-chat"),
			patch: {
				model: "   ",
			},
		});

		expect(patch).toEqual({
			model: null,
		});
	});

	test("syncs codex prompt command when only command is updated", () => {
		const patch = normalizeAgentPresetPatch({
			definition: getBuiltinAgentDefinition("codex"),
			patch: {
				command:
					'codex -c model_reasoning_effort="medium" --dangerously-bypass-approvals-and-sandbox -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true',
			},
		});

		expect(patch).toEqual({
			command:
				'codex -c model_reasoning_effort="medium" --dangerously-bypass-approvals-and-sandbox -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true',
			promptCommand:
				'codex -c model_reasoning_effort="medium" --dangerously-bypass-approvals-and-sandbox -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true --',
		});
	});

	test("keeps explicit prompt command when provided", () => {
		const patch = normalizeAgentPresetPatch({
			definition: getBuiltinAgentDefinition("codex"),
			patch: {
				command: "codex --medium",
				promptCommand: "codex --prompt-medium --",
			},
		});

		expect(patch).toEqual({
			command: "codex --medium",
			promptCommand: "codex --prompt-medium --",
		});
	});

	test("rejects unknown task template variables", () => {
		expect(() =>
			normalizeAgentPresetPatch({
				definition: getBuiltinAgentDefinition("superset-chat"),
				patch: {
					taskPromptTemplate: "Hello {{unknown}}",
				},
			}),
		).toThrow(TRPCError);
	});

	test("rejects patches that do not apply to the agent kind", () => {
		expect(() =>
			normalizeAgentPresetPatch({
				definition: getBuiltinAgentDefinition("superset-chat"),
				patch: {
					command: "codex",
				},
			}),
		).toThrow(TRPCError);
	});
});
