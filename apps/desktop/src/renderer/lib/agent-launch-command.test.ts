import { describe, expect, it } from "bun:test";
import {
	getAgentCommandText,
	parseAgentCommandText,
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
		expect(getAgentCommandText(agent)).toBe(
			"ANTHROPIC_BASE_URL=https://example.test ANTHROPIC_AUTH_TOKEN=abc claude --dangerously-skip-permissions",
		);
	});

	it("preserves shell snippets instead of reparsing them as argv", () => {
		const command =
			"setCodexMode work && codex --dangerously-bypass-approvals-and-sandbox";
		expect(parseAgentCommandText(command)).toEqual({
			command,
			args: [],
			env: {},
		});
		expect(
			getAgentCommandText({
				command,
				args: [],
				env: {},
			}),
		).toBe(command);
	});

	it("does not treat quoted shell operators as shell snippets", () => {
		expect(parseAgentCommandText("claude --label 'a && b'")).toEqual({
			command: "claude",
			args: ["--label", "a && b"],
			env: {},
		});
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
