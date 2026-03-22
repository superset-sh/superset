import { describe, expect, test } from "bun:test";
import type { TerminalPreset } from "@superset/local-db";
import type { ResolvedAgentConfig } from "shared/utils/agent-settings";
import { hydrateAgentPresetsFromTerminalPresets } from "./agent-backed-agent-presets";

describe("hydrateAgentPresetsFromTerminalPresets", () => {
	test("hydrates terminal agent command from matching terminal preset", () => {
		const agentPresets: ResolvedAgentConfig[] = [
			{
				id: "codex",
				source: "builtin",
				kind: "terminal",
				label: "Codex",
				enabled: true,
				command:
					'codex -c model_reasoning_effort="high" --dangerously-bypass-approvals-and-sandbox -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true',
				promptCommand:
					'codex -c model_reasoning_effort="high" --dangerously-bypass-approvals-and-sandbox -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true --',
				taskPromptTemplate: "{{title}}",
				overriddenFields: [],
			},
		];
		const terminalPresets: TerminalPreset[] = [
			{
				id: "preset-codex",
				name: "codex",
				description: "Codex preset",
				cwd: "",
				commands: [
					'codex -c model_reasoning_effort="medium" --dangerously-bypass-approvals-and-sandbox -c model_reasoning_summary="detailed" -c model_supports_reasoning_summaries=true',
				],
			},
		];

		const hydrated = hydrateAgentPresetsFromTerminalPresets({
			agentPresets,
			terminalPresets,
		});

		const codexPreset = hydrated[0];
		expect(codexPreset?.kind).toBe("terminal");
		if (!codexPreset || codexPreset.kind !== "terminal") {
			throw new Error("Expected terminal codex preset");
		}

		expect(codexPreset.command).toContain('model_reasoning_effort="medium"');
		expect(codexPreset.promptCommand).toContain(
			'model_reasoning_effort="medium"',
		);
	});

	test("does not override agent command when explicitly overridden in agent settings", () => {
		const agentPresets: ResolvedAgentConfig[] = [
			{
				id: "codex",
				source: "builtin",
				kind: "terminal",
				label: "Codex",
				enabled: true,
				command: "codex --agent-override",
				promptCommand: "codex --agent-override --",
				taskPromptTemplate: "{{title}}",
				overriddenFields: ["command"],
			},
		];
		const terminalPresets: TerminalPreset[] = [
			{
				id: "preset-codex",
				name: "codex",
				description: "Codex preset",
				cwd: "",
				commands: ["codex --terminal-override"],
			},
		];

		const hydrated = hydrateAgentPresetsFromTerminalPresets({
			agentPresets,
			terminalPresets,
		});

		const codexPreset = hydrated[0];
		expect(codexPreset?.kind).toBe("terminal");
		if (!codexPreset || codexPreset.kind !== "terminal") {
			throw new Error("Expected terminal codex preset");
		}

		expect(codexPreset.command).toBe("codex --agent-override");
	});
});
