import { describe, expect, it } from "bun:test";
import {
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
