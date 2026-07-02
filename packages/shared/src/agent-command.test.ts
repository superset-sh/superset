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
			"codex --dangerously-bypass-approvals-and-sandbox -- \"$(cat <<'SUPERSET_PROMPT_12345678'",
		);
		expect(command).toContain("- Only modified file: runtime.ts");
	});

	it("strips escape sequences and control chars from the prompt", () => {
		const command = buildAgentPromptCommand({
			prompt: "fix \x1b[31mred\x1b[0m bug\x07\r\nnext\u009b1m line",
			randomId: "esc-1234",
			agent: "claude",
		});

		expect(command).toContain("fix [31mred[0m bug\nnext1m line");
		expect(command).not.toContain("\x1b");
		expect(command).not.toContain("\x07");
		expect(command).not.toContain("\r");
		expect(command).not.toContain("\u009b");
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

	it("uses Amp interactive stdin mode for prompt launches", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "amp-1234",
			agent: "amp",
		});

		expect(command).toStartWith("amp <<'SUPERSET_PROMPT_amp1234'");
		expect(command).not.toContain("amp -x");
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

		expect(command).toStartWith("pi \"$(cat <<'SUPERSET_PROMPT_pi1234'");
		expect(command).not.toContain("pi -p");
	});
});
