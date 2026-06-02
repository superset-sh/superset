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

		// Commands are wrapped in `bash -c '...'` so fish/zsh users can run
		// the bash-only heredoc syntax. Single quotes inside become `'\''`.
		expect(command).toStartWith(
			"bash -c 'codex --dangerously-bypass-approvals-and-sandbox -- \"$(cat <<'\\''SUPERSET_PROMPT_12345678'\\''",
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
			"bash -c 'claude --permission-mode acceptEdits \"$(cat <<'\\''SUPERSET_PROMPT_abcdefgh'\\''",
		);
	});

	it("uses Amp interactive stdin mode for prompt launches", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "amp-1234",
			agent: "amp",
		});

		expect(command).toStartWith(
			"bash -c 'amp <<'\\''SUPERSET_PROMPT_amp1234'\\''",
		);
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

		expect(command).toStartWith(
			"bash -c 'pi \"$(cat <<'\\''SUPERSET_PROMPT_pi1234'\\''",
		);
		expect(command).not.toContain("pi -p");
	});
});
