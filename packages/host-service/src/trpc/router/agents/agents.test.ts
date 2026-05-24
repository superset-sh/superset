import { describe, expect, it } from "bun:test";
import { buildAgentCommandString } from "./agents";

function makeConfig(
	overrides: Partial<Parameters<typeof buildAgentCommandString>[0]> = {},
): Parameters<typeof buildAgentCommandString>[0] {
	return {
		id: "id",
		presetId: "preset",
		label: "Agent",
		command: "claude",
		args: [],
		promptTransport: "argv",
		promptArgs: [],
		env: {},
		...overrides,
	};
}

describe("buildAgentCommandString", () => {
	it("single-quotes ordinary argv tokens and the prompt", () => {
		const cmd = buildAgentCommandString(
			makeConfig({ command: "claude", args: ["--flag"] }),
			"hello",
		);
		expect(cmd).toBe("'claude' '--flag' 'hello'");
	});

	it("emits shell control operators unquoted so chained commands run (regression for #4860)", () => {
		const cmd = buildAgentCommandString(
			makeConfig({
				command: "setCodexMode",
				args: [
					"work",
					"&&",
					"codex",
					"--dangerously-bypass-approvals-and-sandbox",
				],
			}),
			"hello",
		);
		expect(cmd).toBe(
			"'setCodexMode' 'work' && 'codex' '--dangerously-bypass-approvals-and-sandbox' 'hello'",
		);
	});
});
