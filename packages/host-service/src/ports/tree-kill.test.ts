import { describe, expect, test } from "bun:test";
import { buildWindowsTaskkillArgs } from "./tree-kill";

describe("host-service tree kill helpers", () => {
	test("builds Windows taskkill arguments for a process tree", () => {
		expect(buildWindowsTaskkillArgs(5678)).toEqual([
			"/PID",
			"5678",
			"/T",
			"/F",
		]);
	});
});
