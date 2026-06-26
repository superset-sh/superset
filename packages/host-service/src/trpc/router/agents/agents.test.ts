import { describe, expect, it } from "bun:test";
import { buildAgentCommandString } from "./agents";

interface TestAgentConfig {
	id: string;
	presetId: string;
	label: string;
	command: string;
	args: string[];
	promptTransport: "argv" | "stdin";
	promptArgs: string[];
	env: Record<string, string>;
}

function makeConfig(overrides: Partial<TestAgentConfig> = {}): TestAgentConfig {
	return {
		id: "test-id",
		presetId: "test-preset",
		label: "Test Agent",
		command: "claude",
		args: [],
		promptTransport: "argv",
		promptArgs: [],
		env: {},
		...overrides,
	};
}

describe("buildAgentCommandString (issue #4971)", () => {
	it("does not wrap safe tokens in single quotes", () => {
		const config = makeConfig({
			command: "claude",
			args: ["--config", "some/path"],
		});

		const result = buildAgentCommandString(config, "hello");

		expect(result).toBe("claude --config some/path hello");
	});

	it("leaves a bare command name unquoted so shell aliases expand", () => {
		const config = makeConfig({
			command: "myclaude",
			args: [],
			promptTransport: "stdin",
		});

		const result = buildAgentCommandString(config, "hello");

		expect(result.startsWith("myclaude ")).toBe(true);
		expect(result.startsWith("'myclaude'")).toBe(false);
	});

	it("still quotes tokens that contain shell-unsafe characters", () => {
		const config = makeConfig({
			command: "claude",
			args: ["--label", "with space"],
		});

		const result = buildAgentCommandString(config, "hi");

		expect(result).toBe("claude --label 'with space' hi");
	});

	it("preserves stdin heredoc transport without over-quoting argv", () => {
		const config = makeConfig({
			command: "claude",
			args: ["--dangerously-skip-permissions"],
			promptTransport: "stdin",
		});

		const result = buildAgentCommandString(config, "prompt body");

		expect(result).toContain("claude --dangerously-skip-permissions <<");
		expect(result).not.toContain("'claude'");
		expect(result).not.toContain("'--dangerously-skip-permissions'");
	});
});
