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

	it("omits --dangerously-skip-permissions for claude when skipPermissions is false", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "abcd-efgh",
			agent: "claude",
			skipPermissions: false,
		});

		expect(command).not.toContain("--dangerously-skip-permissions");
		expect(command).toStartWith("claude \"$(cat <<'SUPERSET_PROMPT_abcdefgh'");
	});

	it("omits --dangerously-bypass-approvals-and-sandbox for codex when skipPermissions is false", () => {
		const command = buildAgentPromptCommand({
			prompt: "do something",
			randomId: "1234-5678",
			agent: "codex",
			skipPermissions: false,
		});

		expect(command).not.toContain("--dangerously-bypass-approvals-and-sandbox");
		expect(command).toContain("codex");
	});

	it("omits --yolo for gemini when skipPermissions is false", () => {
		const command = buildAgentPromptCommand({
			prompt: "do something",
			randomId: "1234-5678",
			agent: "gemini",
			skipPermissions: false,
		});

		expect(command).not.toContain("--yolo");
		expect(command).toStartWith("gemini \"$(cat <<'SUPERSET_PROMPT_12345678'");
	});

	it("defaults to including permission-skip flags (backward compat)", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "abcd-efgh",
			agent: "claude",
		});

		expect(command).toContain("--dangerously-skip-permissions");
	});
});

describe("buildAgentFileCommand", () => {
	it("omits --dangerously-skip-permissions for claude when skipPermissions is false", () => {
		const command = buildAgentFileCommand({
			filePath: "/tmp/prompt.txt",
			agent: "claude",
			skipPermissions: false,
		});

		expect(command).not.toContain("--dangerously-skip-permissions");
		expect(command).toContain("claude");
		expect(command).toContain("/tmp/prompt.txt");
	});

	it("includes --dangerously-skip-permissions by default", () => {
		const command = buildAgentFileCommand({
			filePath: "/tmp/prompt.txt",
			agent: "claude",
		});

		expect(command).toContain("--dangerously-skip-permissions");
	});
});
