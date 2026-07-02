import { describe, expect, test } from "bun:test";
import {
	buildPromptCommandString,
	buildPromptFileCommandString,
} from "./agent-prompt-launch";

/**
 * Regression coverage for #5398: launch commands are written verbatim into the
 * user's interactive login shell. When that shell is fish, the bash heredoc
 * syntax (`<<`) the prompt builder emitted aborted the whole line with
 * "Expected a string, but found a redirection" before the agent ever ran.
 */

function fishAvailable(): boolean {
	return Bun.spawnSync(["fish", "--version"]).exitCode === 0;
}

function runInFish(command: string): { exitCode: number; stderr: string } {
	const result = Bun.spawnSync(["fish", "-c", command]);
	return { exitCode: result.exitCode, stderr: result.stderr.toString() };
}

describe("buildPromptCommandString fish compatibility (#5398)", () => {
	test("argv heredoc no longer leaks raw redirection into the outer shell", () => {
		const command = buildPromptCommandString({
			command: "claude --dangerously-skip-permissions",
			transport: "argv",
			prompt: "My prompt....",
			randomId: "1234-5678",
		});

		// The heredoc must be sealed inside a bash subshell so a fish (or any
		// non-POSIX) login shell never parses the `<<` operator directly.
		expect(command).toStartWith("bash -c '");
		expect(command).not.toStartWith("claude ");
	});

	test("stdin heredoc is wrapped for bash", () => {
		const command = buildPromptCommandString({
			command: "amp",
			transport: "stdin",
			prompt: "do the thing",
			randomId: "amp-1234",
		});

		expect(command).toStartWith("bash -c '");
		// Inner single quotes are escaped as '\'' once wrapped for bash -c.
		expect(command).toContain("amp <<");
		expect(command).toContain("SUPERSET_PROMPT_amp1234");
	});

	test.skipIf(!fishAvailable())(
		"fish runs the generated argv command and recovers the exact prompt",
		() => {
			const prompt = "line one\nwith a ' quote\nline three";
			// `printf %s` stands in for the real agent: it echoes whatever prompt
			// argument it receives, so a clean run proves both that fish parsed the
			// command and that the prompt round-tripped intact.
			const command = buildPromptCommandString({
				command: "printf %s",
				transport: "argv",
				prompt,
				randomId: "fish-test",
			});

			const result = Bun.spawnSync(["fish", "-c", command]);
			expect(result.stderr.toString()).toBe("");
			expect(result.exitCode).toBe(0);
			expect(result.stdout.toString()).toBe(prompt);
		},
	);

	test.skipIf(!fishAvailable())(
		"fish pipes the stdin-transport prompt to the agent",
		() => {
			const prompt = "My prompt....";
			const command = buildPromptCommandString({
				command: "cat",
				transport: "stdin",
				prompt,
				randomId: "amp-1234",
			});

			const result = Bun.spawnSync(["fish", "-c", command]);
			expect(result.stderr.toString()).toBe("");
			expect(result.exitCode).toBe(0);
			expect(result.stdout.toString()).toBe(`${prompt}\n`);
		},
	);

	test.skipIf(!fishAvailable())(
		"the unwrapped heredoc that shipped in #5398 fails under fish",
		() => {
			// Reconstruct the pre-fix command shape to document the original break.
			const broken = `cat <<'SUPERSET_PROMPT_X'\nMy prompt....\nSUPERSET_PROMPT_X`;
			const { exitCode, stderr } = runInFish(broken);

			expect(exitCode).not.toBe(0);
			expect(stderr).toContain("found a redirection");
		},
	);
});

describe("buildPromptFileCommandString stays valid in fish (#5398)", () => {
	test.skipIf(!fishAvailable())("stdin file redirection runs in fish", () => {
		const command = buildPromptFileCommandString({
			command: "cat",
			transport: "stdin",
			filePath: "/etc/hostname",
		});

		// `<` redirection is valid fish syntax, so file launches were unaffected
		// and intentionally left unwrapped.
		expect(runInFish(command).exitCode).toBe(0);
	});
});
