import { describe, expect, it } from "bun:test";
import {
	argsFromInput,
	extractShellOutput,
	isToolError,
	pickNumber,
	pickString,
	statusFromToolState,
	stripAnsi,
} from "./toolHelpers";

describe("statusFromToolState", () => {
	it("maps every ToolState kind to a BasicTool status", () => {
		expect(statusFromToolState({ kind: "input-streaming", input: {} })).toBe(
			"pending",
		);
		expect(statusFromToolState({ kind: "running", input: {} })).toBe("running");
		expect(
			statusFromToolState({ kind: "completed", input: {}, output: {} }),
		).toBe("completed");
		expect(
			statusFromToolState({
				kind: "error",
				input: {},
				error: { message: "x" },
			}),
		).toBe("error");
	});
});

describe("pickString / pickNumber", () => {
	it("returns the first matching key, else undefined", () => {
		expect(pickString({ path: "a", filePath: "b" }, ["filePath", "path"])).toBe(
			"b",
		);
		expect(pickString(undefined, ["path"])).toBeUndefined();
		expect(pickNumber({ n: "42" }, ["n"])).toBe(42);
		expect(pickNumber({ n: 42 }, ["n"])).toBe(42);
		expect(pickNumber({ n: "nope" }, ["n"])).toBeUndefined();
	});
});

describe("argsFromInput", () => {
	it("formats scalar fields, skipping excluded keys", () => {
		const out = argsFromInput(
			{ path: "x", timeout: 30, dryRun: true, body: "huge" },
			new Set(["path", "body"]),
		);
		expect(out).toEqual(["timeout=30", "dryRun=true"]);
	});

	it("caps at limit", () => {
		const out = argsFromInput({ a: 1, b: 2, c: 3, d: 4 }, new Set(), 2);
		expect(out).toEqual(["a=1", "b=2"]);
	});
});

describe("isToolError", () => {
	it("true only for error state", () => {
		expect(
			isToolError({
				id: "t",
				messageID: "m",
				sessionID: "s",
				type: "tool",
				tool: "x",
				time: { start: 0 },
				state: { kind: "error", input: {}, error: { message: "e" } },
			}),
		).toBe(true);
	});
});

describe("extractShellOutput / stripAnsi", () => {
	it("extracts stdout from common output shapes", () => {
		expect(extractShellOutput("raw")).toBe("raw");
		expect(extractShellOutput({ stdout: "out" })).toBe("out");
		expect(extractShellOutput({ text: "t" })).toBe("t");
		expect(extractShellOutput(null)).toBe("");
	});
	it("strips SGR ANSI codes", () => {
		expect(stripAnsi("\u001b[31mred\u001b[0m")).toBe("red");
	});
});
