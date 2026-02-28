import { describe, expect, it } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAgentPromptCommand } from "./agent-command";

function runWithMockCodex(command: string): string[] {
	const tempDir = mkdtempSync(join(tmpdir(), "mock-codex-"));
	const mockCodexPath = join(tempDir, "codex");

	// Print argv as NUL-separated values so newlines and spaces are preserved.
	writeFileSync(
		mockCodexPath,
		`#!/bin/sh
for arg in "$@"; do
  printf '%s\\0' "$arg"
done
`,
		"utf8",
	);
	chmodSync(mockCodexPath, 0o755);

	const result = Bun.spawnSync(["zsh", "-fc", command], {
		env: {
			...process.env,
			PATH: `${tempDir}:${process.env.PATH ?? ""}`,
		},
		stdout: "pipe",
		stderr: "pipe",
	});

	rmSync(tempDir, { recursive: true, force: true });

	expect(result.exitCode).toBe(0);
	const output = Buffer.from(result.stdout).toString("utf8");
	return output.split("\0").filter((value) => value.length > 0);
}

describe("buildAgentPromptCommand", () => {
	it("adds `--` before codex prompt payload", () => {
		const command = buildAgentPromptCommand({
			prompt: "- Only modified file: runtime.ts",
			randomId: "1234-5678",
			agent: "codex",
		});

		expect(command).toContain(
			"--sandbox danger-full-access -- \"$(cat <<'SUPERSET_PROMPT_12345678'",
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

	it("passes hostile prompts as a single codex prompt arg", () => {
		const randomId = "dead-beef";
		const prompts = [
			`- leading bullet
-- second dashy line`,
			"--help should stay prompt text, not a flag",
			`quotes: ' " \` ; && || $(echo nope) \${HOME} \\`,
			`multiline
with tabs\tand spaces   `,
			"contains SUPERSET_PROMPT_deadbeef to force delimiter rollover",
			"contains SUPERSET_PROMPT_deadbeef_X for extra rollover pressure",
			'json-ish {"cmd":"$(rm -rf /)","arr":[1,2,3]}',
		];

		for (const prompt of prompts) {
			const command = buildAgentPromptCommand({
				prompt,
				randomId,
				agent: "codex",
			});
			const argv = runWithMockCodex(command);

			expect(argv.at(-2)).toBe("--");
			expect(argv.at(-1)).toBe(prompt);
		}
	});
});
