import { describe, expect, test } from "bun:test";
import { parseProcessTable, readProcessTable } from "./process-tree.ts";

describe("process tree helpers", () => {
	test("does not attempt Unix ps process discovery on Windows", () => {
		expect(readProcessTable("win32")).toEqual([]);
	});

	test("parses ps process table output", () => {
		expect(
			parseProcessTable(`
				101 1 101
				202 101 101
				invalid row
				303 202 303
			`),
		).toEqual([
			{ pid: 101, ppid: 1, pgid: 101 },
			{ pid: 202, ppid: 101, pgid: 101 },
			{ pid: 303, ppid: 202, pgid: 303 },
		]);
	});
});
