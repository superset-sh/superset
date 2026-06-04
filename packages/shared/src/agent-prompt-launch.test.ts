import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	buildPromptCommandString,
	buildPromptFileCommandString,
} from "./agent-prompt-launch";

/**
 * macOS terminal line discipline buffers canonical-mode input line by line,
 * with a hard per-line limit (`TTYHOG` / `MAX_INPUT`) of 1024 bytes. Any single
 * line at or above that size is mangled/dropped before the shell reads it, which
 * hangs the launch command (see issue #5092). The command we feed into the PTY
 * must therefore keep every physical line comfortably under that limit.
 */
const MAX_CANONICAL_LINE_BYTES = 1024;

function maxLineByteLength(value: string): number {
	return value
		.split("\n")
		.reduce((max, line) => Math.max(max, Buffer.byteLength(line, "utf8")), 0);
}

/** Run a shell command and return stdout, asserting it exited cleanly. */
function runInShell(command: string): string {
	const result = spawnSync("bash", ["-c", command], {
		encoding: "utf8",
		timeout: 5000,
	});
	expect(result.error).toBeUndefined();
	expect(result.status).toBe(0);
	return result.stdout;
}

describe("buildPromptCommandString", () => {
	it("keeps every line under the macOS canonical-mode limit for a long single-line prompt", () => {
		// A single line well past the 1024-byte canonical limit, with no newlines.
		const longLinePrompt = "x".repeat(1100);

		const command = buildPromptCommandString({
			command: "claude --dangerously-skip-permissions",
			transport: "argv",
			prompt: longLinePrompt,
			randomId: "abcd-efgh",
		});

		expect(maxLineByteLength(command)).toBeLessThan(MAX_CANONICAL_LINE_BYTES);
	});

	it("keeps lines under the limit for a long single-line stdin prompt", () => {
		const longLinePrompt = "y".repeat(4096);

		const command = buildPromptCommandString({
			command: "amp",
			transport: "stdin",
			prompt: longLinePrompt,
			randomId: "amp-1234",
		});

		expect(maxLineByteLength(command)).toBeLessThan(MAX_CANONICAL_LINE_BYTES);
	});

	it("reconstructs the prompt verbatim through the argv transport", () => {
		const prompt = "x".repeat(1100);
		// `printf %s "$1"` echoes the reconstructed argv payload to stdout.
		const command = buildPromptCommandString({
			command: "printf %s",
			transport: "argv",
			prompt,
			randomId: "abcd-efgh",
		});

		expect(runInShell(command)).toBe(prompt);
	});

	it("reconstructs a prompt with shell metacharacters verbatim (argv)", () => {
		const prompt = `mix of 'single' "double" $VARS \`backticks\` \\backslashes\\ and %s %d ${"z".repeat(1200)}`;
		const command = buildPromptCommandString({
			command: "printf %s",
			transport: "argv",
			prompt,
			randomId: "1234-5678",
		});

		expect(runInShell(command)).toBe(prompt);
	});

	it("reconstructs a multi-line prompt verbatim (argv)", () => {
		const prompt = `${"a".repeat(1500)}\nsecond line with 'quotes'\n${"b".repeat(1500)}`;
		const command = buildPromptCommandString({
			command: "printf %s",
			transport: "argv",
			prompt,
			randomId: "1234-5678",
		});

		// Command substitution strips trailing newlines, but interior content is exact.
		expect(runInShell(command)).toBe(prompt);
	});

	it("reconstructs the prompt verbatim through the stdin transport", () => {
		const prompt = "y".repeat(4096);
		const command = buildPromptCommandString({
			command: "cat",
			transport: "stdin",
			prompt,
			randomId: "amp-1234",
		});

		expect(runInShell(command)).toBe(prompt);
	});
});

describe("buildPromptFileCommandString", () => {
	it("produces short command lines (file transport is inherently safe)", () => {
		const command = buildPromptFileCommandString({
			command: "claude --dangerously-skip-permissions",
			transport: "argv",
			filePath: ".superset/task-demo.md",
		});

		expect(maxLineByteLength(command)).toBeLessThan(MAX_CANONICAL_LINE_BYTES);
	});
});
