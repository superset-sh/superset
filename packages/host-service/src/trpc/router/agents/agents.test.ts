import { describe, expect, it } from "bun:test";
import { buildAgentCommandString } from "./agents";

const argvConfig = {
	id: "00000000-0000-0000-0000-000000000001",
	presetId: "claude",
	label: "Claude",
	command: "claude",
	args: ["--dangerously-skip-permissions"],
	promptTransport: "argv" as const,
	promptArgs: [],
	env: {},
};

const stdinConfig = {
	id: "00000000-0000-0000-0000-000000000002",
	presetId: "amp",
	label: "Amp",
	command: "amp",
	args: [],
	promptTransport: "stdin" as const,
	promptArgs: [],
	env: {},
};

const RANDOM_ID = "test-1234";
const DELIMITER = "SUPERSET_PROMPT_test1234";

describe("buildAgentCommandString", () => {
	it("delivers the prompt via a quoted heredoc substitution (argv transport)", () => {
		expect(
			buildAgentCommandString(argvConfig, "do the thing", [], RANDOM_ID),
		).toBe(
			`'claude' '--dangerously-skip-permissions' "$(cat <<'${DELIMITER}'\ndo the thing\n${DELIMITER}\n)"`,
		);
	});

	it("inserts model args between base args and the prompt (argv transport)", () => {
		expect(
			buildAgentCommandString(
				argvConfig,
				"do the thing",
				["--model", "sonnet"],
				RANDOM_ID,
			),
		).toBe(
			`'claude' '--dangerously-skip-permissions' '--model' 'sonnet' "$(cat <<'${DELIMITER}'\ndo the thing\n${DELIMITER}\n)"`,
		);
	});

	it("inserts model args before the heredoc (stdin transport)", () => {
		expect(
			buildAgentCommandString(
				stdinConfig,
				"do the thing",
				["--model", "sonnet"],
				RANDOM_ID,
			),
		).toBe(
			`'amp' '--model' 'sonnet' <<'${DELIMITER}'\ndo the thing\n${DELIMITER}`,
		);
	});

	it("shell-quotes hostile model values", () => {
		expect(
			buildAgentCommandString(
				argvConfig,
				"p",
				["--model", "x'; rm -rf /"],
				RANDOM_ID,
			),
		).toBe(
			`'claude' '--dangerously-skip-permissions' '--model' 'x'\\''; rm -rf /' "$(cat <<'${DELIMITER}'\np\n${DELIMITER}\n)"`,
		);
	});

	it("includes promptArgs before the prompt when a prompt is present", () => {
		const config = { ...argvConfig, promptArgs: ["-p"] };
		expect(buildAgentCommandString(config, "p", [], RANDOM_ID)).toBe(
			`'claude' '--dangerously-skip-permissions' '-p' "$(cat <<'${DELIMITER}'\np\n${DELIMITER}\n)"`,
		);
	});

	it("drops promptArgs and the prompt payload when the prompt sanitizes to empty", () => {
		const config = { ...argvConfig, promptArgs: ["-p"] };
		expect(buildAgentCommandString(config, "\x1b\x07", [], RANDOM_ID)).toBe(
			"'claude' '--dangerously-skip-permissions'",
		);
		expect(buildAgentCommandString(stdinConfig, "", [], RANDOM_ID)).toBe(
			"'amp'",
		);
	});
});
