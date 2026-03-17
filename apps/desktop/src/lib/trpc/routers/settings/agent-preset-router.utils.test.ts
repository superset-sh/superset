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
