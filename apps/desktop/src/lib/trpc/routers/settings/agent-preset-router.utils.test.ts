import { describe, expect, test } from "bun:test";
import { getBuiltinAgentDefinition } from "@superset/shared/agent-catalog";
import { TRPCError } from "@trpc/server";
import {
	createCustomAgentInputSchema,
	normalizeAgentPresetPatch,
	normalizeCreateCustomAgentInput,
	normalizeCustomAgentPatch,
	updateAgentPresetInputSchema,
	updateCustomAgentInputSchema,
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

describe("custom agent schemas", () => {
	test("rejects empty custom-agent patches", () => {
		const result = updateCustomAgentInputSchema.safeParse({
			id: "custom:test",
			patch: {},
		});

		expect(result.success).toBe(false);
	});

	test("accepts custom-agent create payloads", () => {
		const result = createCustomAgentInputSchema.safeParse({
			label: " Team Agent ",
			command: " team-agent ",
			taskPromptTemplate: " Task {{slug}} ",
		});

		expect(result.success).toBe(true);
	});
});

describe("custom agent normalization", () => {
	test("trims custom-agent create input and clears blank optional strings", () => {
		const normalized = normalizeCreateCustomAgentInput({
			label: "  Team Agent  ",
			description: "   ",
			command: "  team-agent  ",
			promptCommand: "  team-agent  ",
			promptCommandSuffix: "   ",
			promptTransport: "argv",
			taskPromptTemplate: "  Task {{slug}}  ",
			enabled: false,
		});

		expect(normalized).toEqual({
			label: "Team Agent",
			description: undefined,
			command: "team-agent",
			promptCommand: undefined,
			promptCommandSuffix: undefined,
			promptTransport: undefined,
			taskPromptTemplate: "Task {{slug}}",
			enabled: false,
		});
	});

	test("normalizes custom-agent patches and clears blank optional strings to null", () => {
		const normalized = normalizeCustomAgentPatch({
			promptCommand: "   ",
			description: "   ",
			promptCommandSuffix: "   ",
			promptTransport: "argv",
			command: "  team-agent  ",
		});

		expect(normalized).toEqual({
			promptCommand: null,
			description: null,
			promptCommandSuffix: null,
			promptTransport: null,
			command: "team-agent",
		});
	});

	test("rejects custom-agent task templates with unknown variables", () => {
		expect(() =>
			normalizeCustomAgentPatch({
				taskPromptTemplate: "Task {{unknown}}",
			}),
		).toThrow(TRPCError);
	});
});
