import { describe, expect, it } from "bun:test";
import {
	joinArgs,
	joinCommandArgs,
	joinCommandArgsWithEnv,
	parseArgs,
	parseCommandString,
	parseLaunchCommandString,
} from "./argv";

describe("parseCommandString", () => {
	it("splits a simple command and args", () => {
		expect(parseCommandString("claude --permission-mode acceptEdits")).toEqual({
			command: "claude",
			args: ["--permission-mode", "acceptEdits"],
		});
	});

	it("preserves quoted segments containing spaces", () => {
		expect(
			parseCommandString('codex -c "model_reasoning_effort=high"'),
		).toEqual({
			command: "codex",
			args: ["-c", "model_reasoning_effort=high"],
		});
	});

	it("returns empty command for empty input", () => {
		expect(parseCommandString("")).toEqual({ command: "", args: [] });
		expect(parseCommandString("   ")).toEqual({ command: "", args: [] });
	});
});

describe("joinCommandArgs", () => {
	it("returns command alone when args are empty", () => {
		expect(joinCommandArgs("amp", [])).toBe("amp");
	});

	it("round-trips a command path with spaces", () => {
		const command = "/opt/My Agent/bin/runner";
		const args = ["--flag"];
		const joined = joinCommandArgs(command, args);
		const reparsed = parseCommandString(joined);
		expect(reparsed.command).toBe(command);
		expect(reparsed.args).toEqual(args);
	});

	it("preserves tilde-expanded command paths", () => {
		expect(joinCommandArgs("~/bin/runner", [])).toBe("~/bin/runner");
	});

	it("round-trips an empty quoted arg", () => {
		const args = ["--name", "", "--flag"];
		const joined = joinCommandArgs("amp", args);
		const reparsed = parseCommandString(joined);
		expect(reparsed.command).toBe("amp");
		expect(reparsed.args).toEqual(args);
	});

	it("round-trips quoted args through parse and join", () => {
		const args = ["-c", "model_reasoning_effort=high"];
		const joined = joinCommandArgs("codex", args);
		expect(joined).toBe("codex -c model_reasoning_effort=high");
		const reparsed = parseCommandString(joined);
		expect(reparsed.command).toBe("codex");
		expect(reparsed.args).toEqual(args);
	});

	it("round-trips claude default through parse and join", () => {
		const original = "claude --permission-mode acceptEdits";
		const { command, args } = parseCommandString(original);
		expect(joinCommandArgs(command, args)).toBe(original);
	});
});

describe("parseLaunchCommandString / joinCommandArgsWithEnv", () => {
	const launchCases: Array<{
		name: string;
		input: string;
		expected: ReturnType<typeof parseLaunchCommandString>;
	}> = [
		{
			name: "single env before an agent command",
			input: "ANTHROPIC_AUTH_TOKEN=abc claude --dangerously-skip-permissions",
			expected: {
				command: "claude",
				args: ["--dangerously-skip-permissions"],
				env: { ANTHROPIC_AUTH_TOKEN: "abc" },
			},
		},
		{
			name: "multiple env vars before a package script command",
			input: "NODE_ENV=development PORT=3000 bun run dev",
			expected: {
				command: "bun",
				args: ["run", "dev"],
				env: { NODE_ENV: "development", PORT: "3000" },
			},
		},
		{
			name: "env values with urls, tildes, and equals signs",
			input:
				"ANTHROPIC_BASE_URL=https://example.test/v1 CLAUDE_CONFIG_DIR=~/.claude TOKEN=abc=def claude",
			expected: {
				command: "claude",
				args: [],
				env: {
					ANTHROPIC_BASE_URL: "https://example.test/v1",
					CLAUDE_CONFIG_DIR: "~/.claude",
					TOKEN: "abc=def",
				},
			},
		},
		{
			name: "legacy escaped assignment equals before a command",
			input: "ANTHROPIC_AUTH_TOKEN\\=abc claude --dangerously-skip-permissions",
			expected: {
				command: "claude",
				args: ["--dangerously-skip-permissions"],
				env: { ANTHROPIC_AUTH_TOKEN: "abc" },
			},
		},
		{
			name: "empty env value before a command",
			input: "DEBUG= claude",
			expected: {
				command: "claude",
				args: [],
				env: { DEBUG: "" },
			},
		},
		{
			name: "quoted env values with spaces and literal dollar references",
			input: "FOO='bar baz' CONFIG_PATH='$HOME/.config/superset' claude",
			expected: {
				command: "claude",
				args: [],
				env: {
					FOO: "bar baz",
					CONFIG_PATH: "$HOME/.config/superset",
				},
			},
		},
		{
			name: "equals signs after the command are normal args",
			input: "claude FOO=bar --model=sonnet",
			expected: {
				command: "claude",
				args: ["FOO=bar", "--model=sonnet"],
				env: {},
			},
		},
		{
			name: "codex config args with equals signs stay args",
			input: "codex -c model_reasoning_effort=high --sandbox=workspace-write",
			expected: {
				command: "codex",
				args: [
					"-c",
					"model_reasoning_effort=high",
					"--sandbox=workspace-write",
				],
				env: {},
			},
		},
		{
			name: "invalid env keys are treated as the command token",
			input: "1FOO=bar claude",
			expected: {
				command: "1FOO=bar",
				args: ["claude"],
				env: {},
			},
		},
		{
			name: "env executable is not confused with inline env assignment",
			input: "env FOO=bar claude",
			expected: {
				command: "env",
				args: ["FOO=bar", "claude"],
				env: {},
			},
		},
	];

	for (const testCase of launchCases) {
		it(`parses ${testCase.name}`, () => {
			expect(parseLaunchCommandString(testCase.input)).toEqual(
				testCase.expected,
			);
		});
	}

	it("extracts leading env assignments from an editable launch command", () => {
		expect(
			parseLaunchCommandString(
				"ANTHROPIC_BASE_URL=https://example.test ANTHROPIC_AUTH_TOKEN=abc claude --dangerously-skip-permissions",
			),
		).toEqual({
			command: "claude",
			args: ["--dangerously-skip-permissions"],
			env: {
				ANTHROPIC_BASE_URL: "https://example.test",
				ANTHROPIC_AUTH_TOKEN: "abc",
			},
		});
	});

	it("formats env assignments without escaping the assignment equals", () => {
		expect(
			joinCommandArgsWithEnv("claude", ["--dangerously-skip-permissions"], {
				ANTHROPIC_BASE_URL: "https://example.test",
				ANTHROPIC_AUTH_TOKEN: "abc",
			}),
		).toBe(
			"ANTHROPIC_BASE_URL=https://example.test ANTHROPIC_AUTH_TOKEN=abc claude --dangerously-skip-permissions",
		);
	});

	it("quotes env values that need shell protection", () => {
		const joined = joinCommandArgsWithEnv("claude", [], {
			ANTHROPIC_AUTH_TOKEN: "abc def",
			CUSTOM_VALUE: "it's secret",
			CONFIG_PATH: "$HOME/.config/superset",
		});

		expect(parseLaunchCommandString(joined)).toEqual({
			command: "claude",
			args: [],
			env: {
				ANTHROPIC_AUTH_TOKEN: "abc def",
				CUSTOM_VALUE: "it's secret",
				CONFIG_PATH: "$HOME/.config/superset",
			},
		});
	});

	it("round-trips representative editable launch commands", () => {
		for (const testCase of launchCases) {
			const parsed = parseLaunchCommandString(testCase.input);
			const joined = joinCommandArgsWithEnv(
				parsed.command,
				parsed.args,
				parsed.env,
			);
			expect(parseLaunchCommandString(joined)).toEqual(testCase.expected);
		}
	});

	it("normalizes legacy configs that stored env assignments as argv tokens", () => {
		expect(
			joinCommandArgsWithEnv("ANTHROPIC_AUTH_TOKEN=abc", [
				"claude",
				"--dangerously-skip-permissions",
			]),
		).toBe("ANTHROPIC_AUTH_TOKEN=abc claude --dangerously-skip-permissions");
	});
});

describe("parseArgs / joinArgs", () => {
	it("round-trips an empty list", () => {
		expect(parseArgs("")).toEqual([]);
		expect(joinArgs([])).toBe("");
	});

	it("round-trips simple flag args", () => {
		expect(parseArgs("--")).toEqual(["--"]);
		expect(parseArgs("-i")).toEqual(["-i"]);
		expect(joinArgs(["--prompt"])).toBe("--prompt");
	});
});
