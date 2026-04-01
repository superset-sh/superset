import { describe, expect, test } from "bun:test";
import { getBuiltinAgentDefinition } from "@superset/shared/agent-catalog";
import {
	applyCustomAgentDefinitionPatch,
	createOverrideEnvelopeWithPatch,
	deleteCustomAgentDefinition,
	resolveAgentConfigs,
	upsertCustomAgentDefinition,
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

	test("uses amp as the built-in prompt command for Amp", () => {
		const amp = resolveAgentConfigs({}).find((preset) => preset.id === "amp");

		expect(amp).toMatchObject({
			id: "amp",
			kind: "terminal",
			command: "amp",
			promptCommand: "amp",
			enabled: true,
		});
	});

	test("includes custom terminal configs from stored definitions", () => {
		const custom = resolveAgentConfigs({
			customDefinitions: [
				{
					id: "custom:team-agent",
					kind: "terminal",
					label: "Team Agent",
					description: "Team wrapper",
					command: "team-agent",
					promptTransport: "stdin",
					taskPromptTemplate: "Task {{slug}}",
					enabled: false,
				},
			],
		}).find((preset) => preset.id === "custom:team-agent");

		expect(custom).toMatchObject({
			id: "custom:team-agent",
			source: "user",
			kind: "terminal",
			label: "Team Agent",
			command: "team-agent",
			promptCommand: "team-agent",
			promptTransport: "stdin",
			taskPromptTemplate: "Task {{slug}}",
			enabled: false,
		});
	});

	test("ignores legacy overrides for custom terminal configs", () => {
		const custom = resolveAgentConfigs({
			customDefinitions: [
				{
					id: "custom:team-agent",
					kind: "terminal",
					label: "Team Agent",
					command: "team-agent",
					taskPromptTemplate: "Task {{slug}}",
				},
			],
			overrideEnvelope: {
				version: 1,
				presets: [
					{
						id: "custom:team-agent",
						label: "Stale Override",
						command: "stale-command",
						promptCommand: "stale-command --prompt",
						enabled: false,
					},
				],
			},
		}).find((preset) => preset.id === "custom:team-agent");

		expect(custom).toMatchObject({
			id: "custom:team-agent",
			source: "user",
			label: "Team Agent",
			command: "team-agent",
			promptCommand: "team-agent",
			enabled: true,
			overriddenFields: [],
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
				label: definition.label,
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

describe("custom agent definition helpers", () => {
	test("upserts and patches custom definitions", () => {
		const created = upsertCustomAgentDefinition({
			currentDefinitions: [],
			definition: {
				id: "custom:team-agent",
				kind: "terminal",
				label: "Team Agent",
				command: "team-agent",
				taskPromptTemplate: "Task {{slug}}",
			},
		});
		const createdDefinition = created[0];

		if (!createdDefinition) {
			throw new Error("Expected custom agent definition to be created");
		}

		const updated = applyCustomAgentDefinitionPatch({
			definition: createdDefinition,
			patch: {
				description: "Shared team wrapper",
				promptCommandSuffix: "--yolo",
				promptTransport: "stdin",
				enabled: false,
			},
		});

		expect(updated).toMatchObject({
			id: "custom:team-agent",
			description: "Shared team wrapper",
			promptCommandSuffix: "--yolo",
			promptTransport: "stdin",
			enabled: false,
		});
	});

	test("deletes custom definitions by id", () => {
		const definitions = deleteCustomAgentDefinition({
			currentDefinitions: [
				{
					id: "custom:keep",
					kind: "terminal",
					label: "Keep",
					command: "keep",
					taskPromptTemplate: "Task {{slug}}",
				},
				{
					id: "custom:remove",
					kind: "terminal",
					label: "Remove",
					command: "remove",
					taskPromptTemplate: "Task {{slug}}",
				},
			],
			id: "custom:remove",
		});

		expect(definitions).toEqual([
			expect.objectContaining({
				id: "custom:keep",
			}),
		]);
	});
});
