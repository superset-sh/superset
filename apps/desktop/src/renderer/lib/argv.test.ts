import { describe, expect, it } from "bun:test";
import {
	hasShellControlOperators,
	joinArgs,
	joinCommandArgs,
	parseArgs,
	parseCommandString,
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

describe("parseCommandString — shell control operators (issue #4270)", () => {
	it("silently drops `&&` and loses the chained commands on round-trip", () => {
		const input = "omz update && nvm use 22 && claude";
		const { command, args } = parseCommandString(input);
		// Operators are dropped entirely — every remaining token is treated as
		// a positional arg of the first command.
		expect(command).toBe("omz");
		expect(args).toEqual(["update", "nvm", "use", "22", "claude"]);
		// Round-tripping no longer recovers the original; the `&&` operators are
		// gone, which is what the user observed in the UI.
		const rejoined = joinCommandArgs(command, args);
		expect(rejoined).not.toBe(input);
		expect(rejoined).not.toContain("&&");
	});
});

describe("hasShellControlOperators", () => {
	it("flags inputs containing shell control operators", () => {
		expect(hasShellControlOperators("a && b")).toBe(true);
		expect(hasShellControlOperators("a || b")).toBe(true);
		expect(hasShellControlOperators("a ; b")).toBe(true);
		expect(hasShellControlOperators("a | b")).toBe(true);
		expect(hasShellControlOperators("a > out")).toBe(true);
		expect(hasShellControlOperators("a < in")).toBe(true);
	});

	it("returns false for plain command + args", () => {
		expect(hasShellControlOperators("claude")).toBe(false);
		expect(
			hasShellControlOperators("claude --permission-mode acceptEdits"),
		).toBe(false);
		expect(
			hasShellControlOperators('codex -c "model_reasoning_effort=high"'),
		).toBe(false);
		expect(hasShellControlOperators("")).toBe(false);
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
