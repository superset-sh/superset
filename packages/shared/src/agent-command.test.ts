import { describe, expect, it } from "bun:test";
import { buildAgentPromptCommand } from "./agent-command";

describe("buildAgentPromptCommand", () => {
	it("adds `--` before codex prompt payload", () => {
		const command = buildAgentPromptCommand({
			prompt: "- Only modified file: runtime.ts",
			randomId: "1234-5678",
			agent: "codex",
		});

		expect(command).toContain(
			"model_supports_reasoning_summaries=true -- \"$(cat <<'SUPERSET_PROMPT_12345678'",
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

	it("uses kilo --prompt for prompt launches", () => {
		const randomId = "kilo-1234";
		const delimiter = "SUPERSET_PROMPT_kilo1234";
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId,
			agent: "kilocode",
		});
		const startMarker = `<<'${delimiter}'\n`;
		const endMarker = `\n${delimiter}\n`;
		const bodyStart = command.indexOf(startMarker);
		const bodyEnd = command.indexOf(endMarker, bodyStart + startMarker.length);

		expect(command).toStartWith(
			"kilo --prompt \"$(cat <<'SUPERSET_PROMPT_kilo1234'",
		);
		expect(bodyStart).toBeGreaterThanOrEqual(0);
		expect(bodyEnd).toBeGreaterThan(bodyStart);
		expect(command.slice(bodyStart + startMarker.length, bodyEnd)).toContain(
			"hello",
		);
		expect(command).toContain(endMarker);
	});
});
