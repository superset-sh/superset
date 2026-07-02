import { describe, expect, it } from "bun:test";
import {
	BUILTIN_TERMINAL_AGENT_LABELS,
	BUILTIN_TERMINAL_AGENT_PROMPT_COMMANDS,
	BUILTIN_TERMINAL_AGENT_TYPES,
	BUILTIN_TERMINAL_AGENTS,
} from "./builtin-terminal-agents";

describe("Qwen TUI support (#5211)", () => {
	it("registers Qwen as a builtin terminal agent", () => {
		expect(BUILTIN_TERMINAL_AGENT_TYPES).toContain("qwen");
	});

	it("exposes a human-readable label for Qwen", () => {
		expect(BUILTIN_TERMINAL_AGENT_LABELS.qwen).toBe("Qwen");
	});

	it("launches the qwen CLI with an auto-approval flag", () => {
		const qwen = BUILTIN_TERMINAL_AGENTS.find((agent) => agent.id === "qwen");
		expect(qwen).toBeDefined();
		expect(qwen?.command).toContain("qwen");
		expect(qwen?.command).toContain("--approval-mode=auto_edit");
	});

	it("provides a prompt-launch command for Qwen", () => {
		const prompt = BUILTIN_TERMINAL_AGENT_PROMPT_COMMANDS.qwen;
		expect(prompt.command).toContain("qwen");
		expect(prompt.transport).toBe("argv");
	});
});
