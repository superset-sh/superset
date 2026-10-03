import { describe, expect, test } from "bun:test";
import type { CLIError } from "./errors";
import { type BuilderConfig, boolean, number, string } from "./option";
import { parseArgv } from "./parser";

type Configs = Parameters<typeof parseArgv>[1];

/** Mirror what the runner does: name each builder after its key. */
function configs(builders: Record<string, { _: { config: BuilderConfig } }>) {
	return Object.fromEntries(
		Object.entries(builders).map(([key, builder]) => [
			key,
			{ ...builder._.config, name: builder._.config.name ?? key },
		]),
	) as Configs;
}

const AGENT_PRESET = configs({
	label: string() as never,
	promptArg: string("prompt-arg").variadic() as never,
	local: boolean() as never,
	command: string() as never,
});

const GLOBALS = configs({ json: boolean() as never });

function parse(argv: string[], options: Configs = AGENT_PRESET) {
	return parseArgv(["bun", "cli", ...argv], options, GLOBALS);
}

describe("parseArgv option values that start with -", () => {
	test("accepts a dash-shaped value no command declares", () => {
		expect(parse(["--prompt-arg", "-p"]).options.promptArg).toEqual(["-p"]);
	});

	test("accepts a long dash-shaped value", () => {
		expect(parse(["--prompt-arg", "--model"]).options.promptArg).toEqual([
			"--model",
		]);
	});

	test("accumulates repeated dash-shaped variadic values", () => {
		expect(
			parse(["--prompt-arg", "-p", "--prompt-arg", "--dangerous"]).options
				.promptArg,
		).toEqual(["-p", "--dangerous"]);
	});

	test("accepts a negative number", () => {
		const opts = configs({ estimate: number() as never });
		expect(parse(["--estimate", "-5"], opts).options.estimate).toBe(-5);
	});

	test("accepts a bare - as a value", () => {
		expect(parse(["--label", "-"]).options.label).toBe("-");
	});

	test("still reports a forgotten value before a declared flag", () => {
		expect(() => parse(["--label", "--command", "echo"])).toThrow(
			/Option --label requires a value/,
		);
	});

	test("still reports a forgotten value before a declared global flag", () => {
		expect(() => parse(["--label", "--json"])).toThrow(
			/Option --label requires a value/,
		);
	});

	test("still reports a forgotten value before a declared flag in = form", () => {
		expect(() => parse(["--label", "--command=echo"])).toThrow(
			/Option --label requires a value/,
		);
	});

	test("still reports a forgotten value before --", () => {
		expect(() => parse(["--label", "--", "tail"])).toThrow(
			/Option --label requires a value/,
		);
	});

	test("still reports a forgotten value before --help", () => {
		expect(() => parse(["--label", "--help"])).toThrow(
			/Option --label requires a value/,
		);
	});

	test("still reports a forgotten value before a --no- negation", () => {
		expect(() => parse(["--label", "--no-local"])).toThrow(
			/Option --label requires a value/,
		);
	});

	test("still reports a forgotten value at the end of the argv", () => {
		expect(() => parse(["--label"])).toThrow(/Option --label requires a value/);
	});

	test("hints the valid values when an enum option is missing one", () => {
		const opts = configs({
			transport: string().enum("argv", "stdin") as never,
			label: string() as never,
		});
		let thrown: CLIError | undefined;
		try {
			parse(["--transport", "--label"], opts);
		} catch (error) {
			thrown = error as CLIError;
		}
		expect(thrown?.message).toMatch(/Option --transport requires a value/);
		expect(thrown?.suggestion).toBe("Valid values: argv, stdin");
	});

	test("leaves the = form working", () => {
		expect(parse(["--prompt-arg=-p"]).options.promptArg).toEqual(["-p"]);
	});

	test("keeps -- separating positionals from options", () => {
		const result = parse(["--label", "x", "--", "--not-a-flag"]);
		expect(result.options.label).toBe("x");
		expect(result.positionals).toEqual(["--not-a-flag"]);
	});
});
