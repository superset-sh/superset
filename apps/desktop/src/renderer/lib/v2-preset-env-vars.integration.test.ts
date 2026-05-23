import { describe, expect, it } from "bun:test";
import {
	getAgentCommandText,
	isAgentCommandPatchChanged,
	parseAgentCommandText,
	resolvePresetLaunchCommands,
} from "./agent-launch-command";
import { parseLaunchCommandString } from "./argv";

describe("v2 linked preset env var integration", () => {
	const staleLinkedPreset = {
		agentId: "claude-config",
		commands: ["claude --dangerously-skip-permissions"],
	};

	const claudeAgent = {
		id: "claude-config",
		presetId: "claude",
		command: "claude",
		args: ["--dangerously-skip-permissions"],
		env: {},
	};

	it("uses preset-dialog edits to update the linked agent before launch", () => {
		const editedCommand =
			"ANTHROPIC_BASE_URL=https://example.test/v1 ANTHROPIC_AUTH_TOKEN=abc=def CLAUDE_CONFIG_DIR=~/.claude claude --dangerously-skip-permissions";
		const patch = parseLaunchCommandString(editedCommand);
		expect(isAgentCommandPatchChanged(claudeAgent, patch)).toBe(true);
		const updatedAgent = { ...claudeAgent, ...patch };

		expect(staleLinkedPreset.commands).toEqual([
			"claude --dangerously-skip-permissions",
		]);
		expect(
			resolvePresetLaunchCommands(staleLinkedPreset, [updatedAgent]),
		).toEqual([
			"ANTHROPIC_BASE_URL=https://example.test/v1 ANTHROPIC_AUTH_TOKEN=abc=def CLAUDE_CONFIG_DIR=~/.claude claude --dangerously-skip-permissions",
		]);
	});

	it("normalizes a legacy escaped assignment before the preset is launched", () => {
		const patch = parseLaunchCommandString(
			"ANTHROPIC_AUTH_TOKEN\\=abc claude --dangerously-skip-permissions",
		);
		const updatedAgent = { ...claudeAgent, ...patch };

		expect(getAgentCommandText(updatedAgent)).toBe(
			"ANTHROPIC_AUTH_TOKEN=abc claude --dangerously-skip-permissions",
		);
		expect(
			resolvePresetLaunchCommands(staleLinkedPreset, [updatedAgent]),
		).toEqual([
			"ANTHROPIC_AUTH_TOKEN=abc claude --dangerously-skip-permissions",
		]);
	});

	it("preserves linked agent shell snippets with command chaining", () => {
		const command =
			"setCodexMode work && codex --dangerously-bypass-approvals-and-sandbox";
		const patch = parseAgentCommandText(command);
		const updatedAgent = { ...claudeAgent, ...patch };

		expect(
			resolvePresetLaunchCommands(staleLinkedPreset, [updatedAgent]),
		).toEqual([command]);
	});
});
