import { describe, expect, test } from "bun:test";
import { buildWindowsTaskkillArgs } from "./tree-kill";

describe("desktop tree kill helpers", () => {
	test("builds Windows taskkill arguments for a process tree", () => {
		expect(buildWindowsTaskkillArgs(1234)).toEqual([
			"/PID",
			"1234",
			"/T",
			"/F",
		]);
	});
});
