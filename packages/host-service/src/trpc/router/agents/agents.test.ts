import { describe, expect, it } from "bun:test";
import { buildAgentCommandString } from "./agents";

type AgentConfig = Parameters<typeof buildAgentCommandString>[0];

function config(overrides: Partial<AgentConfig> = {}): AgentConfig {
	return {
		id: "agent-1",
		presetId: "amp",
		label: "Amp",
		command: "amp",
		args: [],
		promptTransport: "stdin",
		promptArgs: [],
		env: {},
		...overrides,
	};
}

describe("buildAgentCommandString", () => {
	it("pipes stdin prompts without heredoc syntax", () => {
		const command = buildAgentCommandString(
			config(),
			"hello from fish\nit's safe",
		);

		expect(command).toBe(
			"printf '%s\\n' 'hello from fish\nit'\\''s safe' | 'amp'",
		);
		expect(command).not.toContain("<<");
	});

	it("quotes argv prompts as a single shell argument", () => {
		const command = buildAgentCommandString(
			config({
				command: "codex",
				args: ["--dangerously-bypass-approvals-and-sandbox"],
				promptArgs: ["--"],
				promptTransport: "argv",
			}),
			"- prompt with spaces",
		);

		expect(command).toBe(
			"'codex' '--dangerously-bypass-approvals-and-sandbox' '--' '- prompt with spaces'",
		);
	});
});
