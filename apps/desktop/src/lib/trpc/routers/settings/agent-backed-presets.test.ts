import { describe, expect, test } from "bun:test";
import type { TerminalPreset } from "@superset/local-db";
import { AGENT_PRESET_COMMANDS } from "@superset/shared/agent-command";
import type { ResolvedAgentConfig } from "shared/utils/agent-settings";
import { hydrateAgentBackedPresetCommands } from "./agent-backed-presets";

describe("hydrateAgentBackedPresetCommands", () => {
	test("hydrates default codex template command from agent preset override", () => {
		const defaultCodexCommand = AGENT_PRESET_COMMANDS.codex[0] ?? "codex";
		const customCodexCommand = "codex --experimental-medium-mode";
		const presets: TerminalPreset[] = [
			{
				id: "preset-codex",
				name: "codex",
				description: "Codex preset",
				cwd: "",
				commands: [defaultCodexCommand],
			},
		];
		const hydrated = hydrateAgentBackedPresetCommands({
			presets,
			agentPresets: [
				{
					id: "codex",
					source: "builtin",
					kind: "terminal",
					label: "Codex",
					enabled: true,
					command: customCodexCommand,
					promptCommand: `${customCodexCommand} --`,
					taskPromptTemplate: "{{title}}",
					overriddenFields: ["command"],
				} satisfies ResolvedAgentConfig,
			],
		});

		expect(hydrated).toHaveLength(1);
		expect(hydrated[0]?.commands).toEqual([customCodexCommand]);
	});

	test("does not override user-edited terminal preset commands", () => {
		const customCodexCommand = "codex --experimental-medium-mode";
		const presets: TerminalPreset[] = [
			{
				id: "preset-codex",
				name: "codex",
				description: "Codex preset",
				cwd: "",
				commands: ["codex --user-edited"],
			},
		];
		const hydrated = hydrateAgentBackedPresetCommands({
			presets,
			agentPresets: [
				{
					id: "codex",
					source: "builtin",
					kind: "terminal",
					label: "Codex",
					enabled: true,
					command: customCodexCommand,
					promptCommand: `${customCodexCommand} --`,
					taskPromptTemplate: "{{title}}",
					overriddenFields: ["command"],
				} satisfies ResolvedAgentConfig,
			],
		});

		expect(hydrated[0]?.commands).toEqual(["codex --user-edited"]);
	});

	test("does not touch non-agent presets", () => {
		const presets: TerminalPreset[] = [
			{
				id: "preset-custom",
				name: "my-preset",
				description: "Custom preset",
				cwd: "",
				commands: ["echo hello"],
			},
		];

		const hydrated = hydrateAgentBackedPresetCommands({
			presets,
			agentPresets: [
				{
					id: "codex",
					source: "builtin",
					kind: "terminal",
					label: "Codex",
					enabled: true,
					command: "codex --experimental-medium-mode",
					promptCommand: "codex --experimental-medium-mode --",
					taskPromptTemplate: "{{title}}",
					overriddenFields: ["command"],
				} satisfies ResolvedAgentConfig,
			],
		});

		expect(hydrated).toEqual(presets);
	});

	test("hydrates non-codex terminal agents", () => {
		const defaultClaudeCommand = AGENT_PRESET_COMMANDS.claude[0] ?? "claude";
		const customClaudeCommand = "claude --print";
		const presets: TerminalPreset[] = [
			{
				id: "preset-claude",
				name: "claude",
				description: "Claude preset",
				cwd: "",
				commands: [defaultClaudeCommand],
			},
		];

		const hydrated = hydrateAgentBackedPresetCommands({
			presets,
			agentPresets: [
				{
					id: "claude",
					source: "builtin",
					kind: "terminal",
					label: "Claude",
					enabled: true,
					command: customClaudeCommand,
					promptCommand: customClaudeCommand,
					taskPromptTemplate: "{{title}}",
					overriddenFields: ["command"],
				} satisfies ResolvedAgentConfig,
			],
		});

		expect(hydrated[0]?.commands).toEqual([customClaudeCommand]);
	});
});
