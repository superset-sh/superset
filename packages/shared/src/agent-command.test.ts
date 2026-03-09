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
});

describe("buildAgentPromptCommand - fish shell", () => {
	it("generates fish-incompatible heredoc by default (reproduces #2292)", () => {
		// Without shell param, the command uses bash heredoc syntax which fails in Fish:
		//   fish: Expected a string, but found a redirection
		const command = buildAgentPromptCommand({
			prompt: "do something",
			randomId: "test-1234",
			agent: "claude",
		});

		// The default command contains bash heredoc syntax unsupported by Fish
		expect(command).toContain("<<'");
		expect(command).toContain("$(");
	});

	it("generates fish-compatible command when shell is /opt/homebrew/bin/fish", () => {
		const command = buildAgentPromptCommand({
			prompt: "do something",
			randomId: "test-1234",
			agent: "claude",
			shell: "/opt/homebrew/bin/fish",
		});

		// Fish-compatible: no heredoc, no bash $() substitution
		expect(command).not.toContain("<<'");
		expect(command).not.toContain("$(");
		// Uses Fish command substitution syntax
		expect(command).toMatch(/\(.*base64/);
		expect(command).toStartWith("claude --dangerously-skip-permissions");
	});

	it("generates fish-compatible command when shell is fish", () => {
		const command = buildAgentPromptCommand({
			prompt: "do something",
			randomId: "test-1234",
			agent: "claude",
			shell: "fish",
		});

		expect(command).not.toContain("<<'");
		expect(command).not.toContain("$(");
	});

	it("generates fish-compatible command for codex agent", () => {
		const command = buildAgentPromptCommand({
			prompt: "- Only modified file: runtime.ts",
			randomId: "1234-5678",
			agent: "codex",
			shell: "fish",
		});

		expect(command).not.toContain("<<'");
		expect(command).not.toContain("$(");
		expect(command).toContain("--dangerously-bypass-approvals-and-sandbox");
		expect(command).toMatch(/\(.*base64/);
	});

	it("encodes prompt content in base64 so it can be decoded faithfully", () => {
		const prompt = "hello world\nwith newlines\nand unicode: 🎉";
		const command = buildAgentPromptCommand({
			prompt,
			randomId: "test-1234",
			agent: "claude",
			shell: "fish",
		});

		// Extract the base64 payload from the command
		const match = command.match(/printf '%s' '([A-Za-z0-9+/=]+)'/);
		expect(match).not.toBeNull();
		const encoded = match?.[1];
		const decoded = Buffer.from(encoded, "base64").toString("utf-8");
		expect(decoded).toBe(prompt);
	});

	it("uses non-fish heredoc for bash/zsh shells", () => {
		for (const shell of ["/bin/bash", "/bin/zsh", "/bin/sh"]) {
			const command = buildAgentPromptCommand({
				prompt: "hello",
				randomId: "abcd-efgh",
				agent: "claude",
				shell,
			});
			expect(command).toContain("<<'");
		}
	});
});

describe("buildAgentFileCommand - fish shell", () => {
	it("generates fish-incompatible $() syntax by default (reproduces #2292)", () => {
		const command = buildAgentFileCommand({
			filePath: "/tmp/prompt.txt",
			agent: "claude",
		});

		// Default uses bash $() syntax unsupported by Fish
		expect(command).toContain("$(");
	});

	it("generates fish-compatible command when shell is fish", () => {
		const command = buildAgentFileCommand({
			filePath: "/tmp/prompt.txt",
			agent: "claude",
			shell: "fish",
		});

		expect(command).not.toContain("$(");
		// Uses Fish command substitution (cat ...) without $
		expect(command).toContain("(cat ");
		expect(command).toStartWith("claude --dangerously-skip-permissions");
	});

	it("escapes double quotes in file path for fish", () => {
		const command = buildAgentFileCommand({
			filePath: '/tmp/path with "quotes"/prompt.txt',
			agent: "claude",
			shell: "fish",
		});

		expect(command).not.toContain("$(");
		expect(command).toContain('\\"');
	});
});
