import { describe, expect, test } from "bun:test";
import { getBuiltinAgentDefinition } from "@superset/shared/agent-catalog";
import {
	createOverrideEnvelopeWithPatch,
	resolveAgentConfigs,
} from "./agent-settings";

describe("resolveAgentConfigs", () => {
	test("resolves built-in terminal and chat configs with overrides", () => {
		const presets = resolveAgentConfigs({
			overrideEnvelope: {
				version: 1,
				presets: [
					{
						id: "claude",
						label: "Claude Custom",
						command: "claude-custom",
						promptCommand: "claude-custom --prompt",
						enabled: false,
					},
					{
						id: "superset-chat",
						taskPromptTemplate: "Chat {{slug}}",
					},
				],
			},
		});

		const claude = presets.find((preset) => preset.id === "claude");
		const chat = presets.find((preset) => preset.id === "superset-chat");

		expect(claude).toMatchObject({
			id: "claude",
			kind: "terminal",
			label: "Claude Custom",
			command: "claude-custom",
			promptCommand: "claude-custom --prompt",
			enabled: false,
		});
		expect(claude?.overriddenFields).toEqual(
			expect.arrayContaining(["label", "command", "promptCommand", "enabled"]),
		);

		expect(chat).toMatchObject({
			id: "superset-chat",
			kind: "chat",
			taskPromptTemplate: "Chat {{slug}}",
		});
	});

	test("includes pi as a built-in terminal config", () => {
		const pi = resolveAgentConfigs({}).find((preset) => preset.id === "pi");

		expect(pi).toMatchObject({
			id: "pi",
			kind: "terminal",
			label: "Pi",
			command: "pi",
			promptCommand: "pi",
			enabled: true,
		});
	});

	test("derives codex prompt command from command override when prompt command is not overridden", () => {
		const codex = resolveAgentConfigs({
			overrideEnvelope: {
				version: 1,
				presets: [
					{
						id: "codex",
						command:
							'codex -c model_reasoning_effort="medium" --dangerously-bypass-approvals-and-sandbox -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true',
					},
				],
			},
		}).find((preset) => preset.id === "codex");

		expect(codex).toMatchObject({
			id: "codex",
			kind: "terminal",
			command:
				'codex -c model_reasoning_effort="medium" --dangerously-bypass-approvals-and-sandbox -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true',
			promptCommand:
				'codex -c model_reasoning_effort="medium" --dangerously-bypass-approvals-and-sandbox -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true --',
		});
	});

	test("preserves explicit prompt command override when command is overridden", () => {
		const codexDefinition = getBuiltinAgentDefinition("codex");
		if (codexDefinition.kind !== "terminal") {
			throw new Error("Expected terminal codex definition");
		}

		const codex = resolveAgentConfigs({
			overrideEnvelope: {
				version: 1,
				presets: [
					{
						id: "codex",
						command: "codex --custom-command",
						promptCommand: codexDefinition.defaultPromptCommand,
					},
				],
			},
		}).find((preset) => preset.id === "codex");

		expect(codex).toMatchObject({
			id: "codex",
			kind: "terminal",
			command: "codex --custom-command",
			promptCommand: codexDefinition.defaultPromptCommand,
		});
	});
});

describe("createOverrideEnvelopeWithPatch", () => {
	test("drops fields that match defaults and persists explicit clears", () => {
		const definition = getBuiltinAgentDefinition("claude");
		const overrides = createOverrideEnvelopeWithPatch({
			definition,
			currentOverrides: {
				version: 1,
				presets: [],
			},
			id: "claude",
			patch: {
				label: definition.defaultLabel,
				description: null,
			},
		});

		expect(overrides).toEqual({
			version: 1,
			presets: [
				{
					id: "claude",
					description: null,
				},
			],
		});
	});

	test("preserves unrelated existing overrides when patching one field", () => {
		const definition = getBuiltinAgentDefinition("claude");
		const overrides = createOverrideEnvelopeWithPatch({
			definition,
			currentOverrides: {
				version: 1,
				presets: [
					{
						id: "claude",
						enabled: false,
						command: "claude-custom",
					},
				],
			},
			id: "claude",
			patch: {
				label: "Claude Team",
			},
		});

		expect(overrides).toEqual({
			version: 1,
			presets: [
				{
					id: "claude",
					enabled: false,
					command: "claude-custom",
					label: "Claude Team",
				},
			],
		});
	});
});
