import { describe, expect, it } from "bun:test";
import { HOST_AGENT_PRESETS } from "@superset/shared/host-agent-presets";
import { buildAgentCommandString, buildAgentPromptFollowUp } from "./agents";

function makeConfig(
	overrides: Partial<Parameters<typeof buildAgentCommandString>[0]> = {},
): Parameters<typeof buildAgentCommandString>[0] {
	return {
		id: "agent-1",
		presetId: "custom",
		label: "Agent",
		command: "agent",
		args: [],
		promptTransport: "argv",
		promptArgs: [],
		env: {},
		...overrides,
	};
}

describe("buildAgentCommandString", () => {
	it("passes argv prompts as a quoted positional argument", () => {
		const command = buildAgentCommandString(
			makeConfig({
				command: "codex",
				args: ["--dangerously-bypass-approvals-and-sandbox"],
				promptArgs: ["--"],
			}),
			"fix Bob's test",
		);

		expect(command).toBe(
			"'codex' '--dangerously-bypass-approvals-and-sandbox' '--' 'fix Bob'\\''s test'",
		);
	});

	it("passes stdin prompts as delayed PTY follow-up input", () => {
		const config = makeConfig({
			command: "amp",
			promptTransport: "stdin",
			promptArgs: ["--prompt-mode"],
		});
		const command = buildAgentCommandString(config, "first line\nsecond line");
		const followUp = buildAgentPromptFollowUp(
			config,
			"first line\nsecond line",
		);

		expect(command).toBe("'amp' '--prompt-mode'");
		expect(followUp).toEqual({
			data: "first line\nsecond line\n",
			delayMs: 200,
		});
		expect(command).not.toContain("<<");
		expect(command).not.toContain("SUPERSET_PROMPT");
	});

	it("builds every bundled terminal-agent preset without redirecting stdin", () => {
		const launchInputsByPreset = Object.fromEntries(
			HOST_AGENT_PRESETS.map((preset) => [
				preset.presetId,
				(() => {
					const config = makeConfig({
						presetId: preset.presetId,
						label: preset.label,
						command: preset.command,
						args: [...preset.args],
						promptTransport: preset.promptTransport,
						promptArgs: [...preset.promptArgs],
						env: { ...preset.env },
					});
					return {
						command: buildAgentCommandString(config, "fix Bob's test"),
						followUp: buildAgentPromptFollowUp(config, "fix Bob's test"),
					};
				})(),
			]),
		);

		expect(launchInputsByPreset).toEqual({
			amp: {
				command: "'amp'",
				followUp: { data: "fix Bob's test\n", delayMs: 200 },
			},
			claude: {
				command:
					"'claude' '--dangerously-skip-permissions' 'fix Bob'\\''s test'",
				followUp: undefined,
			},
			codex: {
				command:
					"'codex' '--dangerously-bypass-approvals-and-sandbox' '--' 'fix Bob'\\''s test'",
				followUp: undefined,
			},
			copilot: {
				command: "'copilot' '--allow-tool=write' '-i' 'fix Bob'\\''s test'",
				followUp: undefined,
			},
			"cursor-agent": {
				command: "'cursor-agent' 'fix Bob'\\''s test'",
				followUp: undefined,
			},
			gemini: {
				command: "'gemini' '--approval-mode=auto_edit' 'fix Bob'\\''s test'",
				followUp: undefined,
			},
			mastracode: {
				command: "'mastracode' '--prompt' 'fix Bob'\\''s test'",
				followUp: undefined,
			},
			opencode: {
				command: "'opencode' '--prompt' 'fix Bob'\\''s test'",
				followUp: undefined,
			},
			pi: { command: "'pi' 'fix Bob'\\''s test'", followUp: undefined },
		});

		for (const launchInput of Object.values(launchInputsByPreset)) {
			expect(launchInput.command).not.toContain("<<");
			expect(launchInput.command).not.toContain("SUPERSET_PROMPT");
		}
	});
});
