import { describe, expect, test } from "bun:test";
import { parseGoalCommand, readGoalOutcome, withGoalCommand } from "./goal";

describe("parseGoalCommand", () => {
	test("reads set, show and clear", () => {
		const text = (value: string) => [{ type: "text" as const, text: value }];
		expect(parseGoalCommand(text("/goal ship the fix"))).toEqual({
			kind: "set",
			text: "ship the fix",
		});
		expect(parseGoalCommand(text("  /goal  "))).toEqual({ kind: "show" });
		expect(parseGoalCommand(text("/goal Clear"))).toEqual({ kind: "clear" });
		expect(parseGoalCommand(text("/goals list"))).toBeNull();
		expect(parseGoalCommand(text("set a /goal"))).toBeNull();
	});

	test("ignores hidden parts", () => {
		expect(
			parseGoalCommand([
				{ type: "text", text: "/goal" },
				{ type: "text", text: "MCP context", hidden: true },
			]),
		).toEqual({ kind: "show" });
	});
});

describe("readGoalOutcome", () => {
	test("finds the marker on its own line only", () => {
		expect(readGoalOutcome("All tests pass.\nGOAL_COMPLETE")).toEqual({
			kind: "complete",
		});
		expect(readGoalOutcome("Done.\nGOAL_BLOCKED: need an API key ")).toEqual({
			kind: "blocked",
			reason: "need an API key",
		});
		expect(readGoalOutcome("I will print GOAL_COMPLETE when done")).toEqual({
			kind: "unfinished",
		});
	});
});

test("withGoalCommand replaces an agent's own goal command", () => {
	const commands = withGoalCommand([
		{ name: "goal", description: "agent goal" },
		{ name: "review" },
	]);
	expect(commands.map((command) => command.name)).toEqual(["review", "goal"]);
	expect(commands[1]?.description).not.toBe("agent goal");
});
