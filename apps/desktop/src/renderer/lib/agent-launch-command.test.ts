import { describe, expect, it } from "bun:test";
import {
	buildAgentLaunchCommand,
	resolvePresetLaunchCommands,
} from "./agent-launch-command";

describe("agent launch command helpers", () => {
	const agent = {
		id: "claude-config",
		presetId: "claude",
		command: "claude",
		args: ["--dangerously-skip-permissions"],
		env: {
			ANTHROPIC_BASE_URL: "https://example.test",
			ANTHROPIC_AUTH_TOKEN: "abc",
		},
	};

	it("builds command strings with structured env assignments", () => {
		expect(buildAgentLaunchCommand(agent)).toBe(
			"ANTHROPIC_BASE_URL=https://example.test ANTHROPIC_AUTH_TOKEN=abc claude --dangerously-skip-permissions",
		);
	});

	it("resolves linked presets from the live agent config instead of the snapshot", () => {
		expect(
			resolvePresetLaunchCommands(
				{
					agentId: "claude-config",
					commands: ["claude --dangerously-skip-permissions"],
				},
				[agent],
			),
		).toEqual([
			"ANTHROPIC_BASE_URL=https://example.test ANTHROPIC_AUTH_TOKEN=abc claude --dangerously-skip-permissions",
		]);
	});

	it("falls back to snapshot commands when the linked agent is unavailable", () => {
		expect(
			resolvePresetLaunchCommands(
				{
					agentId: "missing-agent",
					commands: ["claude --dangerously-skip-permissions"],
				},
				[agent],
			),
		).toEqual(["claude --dangerously-skip-permissions"]);
	});
});
