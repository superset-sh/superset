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

		expect(command).toContain(
			"--dangerously-bypass-approvals-and-sandbox -- \"$(cat <<'SUPERSET_PROMPT_12345678'",
		);
		expect(command).toContain("- Only modified file: runtime.ts");
	});

	it("adds `--` before claude prompt payload to prevent dash-prefixed prompts being parsed as flags", () => {
		const command = buildAgentPromptCommand({
			prompt: "---\ntitle: My Document\n---\nContent here",
			randomId: "abcd-efgh",
			agent: "claude",
		});

		expect(command).toContain(
			"claude --dangerously-skip-permissions -- \"$(cat <<'SUPERSET_PROMPT_abcdefgh'",
		);
		expect(command).toContain("---\ntitle: My Document");
	});

	it("adds `--` before gemini prompt payload", () => {
		const command = buildAgentPromptCommand({
			prompt: "---\nfrontmatter\n---",
			randomId: "1111-2222",
			agent: "gemini",
		});

		expect(command).toContain(
			"gemini --yolo -- \"$(cat <<'SUPERSET_PROMPT_11112222'",
		);
	});

	it("adds `--` before copilot prompt payload", () => {
		const command = buildAgentPromptCommand({
			prompt: "---\nfrontmatter\n---",
			randomId: "3333-4444",
			agent: "copilot",
		});

		expect(command).toContain(
			"copilot -i -- \"$(cat <<'SUPERSET_PROMPT_33334444'",
		);
	});

	it("adds `--` before cursor-agent prompt payload", () => {
		const command = buildAgentPromptCommand({
			prompt: "---\nfrontmatter\n---",
			randomId: "5555-6666",
			agent: "cursor-agent",
		});

		expect(command).toContain(
			"cursor-agent --yolo -- \"$(cat <<'SUPERSET_PROMPT_55556666'",
		);
	});
});

describe("buildAgentFileCommand", () => {
	it("adds `--` before claude file prompt to prevent dash-prefixed content being parsed as flags", () => {
		const command = buildAgentFileCommand({
			filePath: "/tmp/prompt.txt",
			agent: "claude",
		});

		expect(command).toBe(
			"claude --dangerously-skip-permissions -- \"$(cat '/tmp/prompt.txt')\"",
		);
	});

	it("adds `--` before codex file prompt", () => {
		const command = buildAgentFileCommand({
			filePath: "/tmp/prompt.txt",
			agent: "codex",
		});

		expect(command).toContain("-- \"$(cat '/tmp/prompt.txt')\"");
	});
});
