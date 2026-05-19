import { describe, expect, it } from "bun:test";
import {
	buildAgentFileCommand,
	buildAgentPromptCommand,
} from "./agent-command";

describe("buildAgentPromptCommand", () => {
	it("adds `--` before codex prompt payload", () => {
		const command = buildAgentPromptCommand({
			prompt: "- Only modified file: runtime.ts",
			randomId: "1234-5678",
			agent: "codex",
		});

		expect(command).toBe(
			"codex --dangerously-bypass-approvals-and-sandbox -- '- Only modified file: runtime.ts'",
		);
	});

	it("does not change non-codex commands", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "abcd-efgh",
			agent: "claude",
		});

		expect(command).toBe("claude --permission-mode acceptEdits 'hello'");
	});

	it("uses Amp interactive stdin mode for prompt launches", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "amp-1234",
			agent: "amp",
		});

		expect(command).toBe("printf '%s\\n' 'hello' | amp");
		expect(command).not.toContain("amp -x");
	});

	it("escapes single quotes without heredoc syntax", () => {
		const command = buildAgentPromptCommand({
			prompt: "it's fish-safe",
			randomId: "quote-1234",
			agent: "claude",
		});

		expect(command).toBe(
			"claude --permission-mode acceptEdits 'it'\\''s fish-safe'",
		);
		expect(command).not.toContain("<<");
		expect(command).not.toContain("$(cat");
	});

	it("uses Amp interactive stdin mode for file launches", () => {
		const command = buildAgentFileCommand({
			filePath: ".superset/task-demo.md",
			agent: "amp",
		});

		expect(command).toBe("amp < '.superset/task-demo.md'");
	});

	it("uses pi interactive mode for prompt launches", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "pi-1234",
			agent: "pi",
		});

		expect(command).toBe("pi 'hello'");
		expect(command).not.toContain("pi -p");
	});
});
