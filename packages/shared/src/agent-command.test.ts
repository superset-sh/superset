import { describe, expect, it } from "bun:test";
import { buildAgentFileCommand, buildAgentPromptCommand } from "./agent-command";

describe("buildAgentPromptCommand", () => {
	it("adds `--` before codex prompt payload", () => {
		const command = buildAgentPromptCommand({
			prompt: "- Only modified file: runtime.ts",
			randomId: "1234-5678",
			agent: "codex",
		});

		expect(command).toContain(
			"--dangerously-bypass-approvals-and-sandbox -c model_reasoning_summary=\"detailed\" -c model_supports_reasoning_summaries=true -- \"$(cat <<'SUPERSET_PROMPT_12345678'",
		);
		expect(command).toContain("- Only modified file: runtime.ts");
	});

	it("does not change non-codex commands", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "abcd-efgh",
			agent: "claude",
		});

		expect(command).toStartWith(
			"claude --dangerously-skip-permissions \"$(cat <<'SUPERSET_PROMPT_abcdefgh'",
		);
	});

	it("uses pi interactive mode for prompt launches", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "pi-1234",
			agent: "pi",
		});

		expect(command).toStartWith("pi \"$(cat <<'SUPERSET_PROMPT_pi1234'");
		expect(command).not.toContain("pi -p");
	});
});

describe("buildAgentFileCommand", () => {
	it("generates bash cat syntax on unix", () => {
		const command = buildAgentFileCommand({
			filePath: ".superset/task-foo.md",
			agent: "claude",
			platform: "unix",
		});

		expect(command).toBe(
			`claude --dangerously-skip-permissions "$(cat '.superset/task-foo.md')"`,
		);
	});

	it("generates PowerShell Get-Content syntax on win32", () => {
		const command = buildAgentFileCommand({
			filePath: ".superset/task-foo.md",
			agent: "claude",
			platform: "win32",
		});

		expect(command).toBe(
			"claude --dangerously-skip-permissions (Get-Content '.superset/task-foo.md' -Raw)",
		);
	});

	it("escapes single quotes for bash", () => {
		const command = buildAgentFileCommand({
			filePath: ".superset/it's-a-task.md",
			agent: "claude",
			platform: "unix",
		});

		expect(command).toContain("it'\\''s-a-task.md");
	});

	it("escapes single quotes for PowerShell", () => {
		const command = buildAgentFileCommand({
			filePath: ".superset/it's-a-task.md",
			agent: "claude",
			platform: "win32",
		});

		expect(command).toContain("it''s-a-task.md");
	});

	it("places suffix after file expression for copilot", () => {
		const command = buildAgentFileCommand({
			filePath: ".superset/task.md",
			agent: "copilot",
			platform: "unix",
		});

		expect(command).toBe(
			`copilot -i "$(cat '.superset/task.md')" --yolo`,
		);
	});

	it("defaults to unix platform", () => {
		const command = buildAgentFileCommand({
			filePath: ".superset/task.md",
			agent: "claude",
		});

		expect(command).toContain("$(cat");
	});
});
