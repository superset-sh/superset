import { describe, expect, test } from "bun:test";
import { parseProcessTable } from "./process-tree.ts";

describe("parseProcessTable", () => {
	test("parses pid/ppid/pgid/tty columns", () => {
		const rows = parseProcessTable(
			[
				"  100   1  100 ttys012  Ss",
				"  200 100  100 ttys012  S",
				"  300   1  300 ??       S",
			].join("\n"),
		);
		expect(rows).toEqual([
			{ pid: 100, ppid: 1, pgid: 100, tty: "ttys012" },
			{ pid: 200, ppid: 100, pgid: 100, tty: "ttys012" },
			{ pid: 300, ppid: 1, pgid: 300, tty: null },
		]);
	});

	test("normalizes no-tty markers to null", () => {
		for (const marker of ["??", "?", "-"]) {
			const rows = parseProcessTable(`  100   1  100 ${marker}  S`);
			expect(rows[0]?.tty).toBeNull();
		}
	});

	test("drops zombie rows", () => {
		const rows = parseProcessTable(
			["  100   1  100 ttys000  Ss", "  200 100  100 ttys000  Z"].join("\n"),
		);
		expect(rows.map((r) => r.pid)).toEqual([100]);
	});

	test("drops malformed rows", () => {
		const rows = parseProcessTable(
			["garbage", "  0  1  1 ?? S", "  100  1  0 ?? S", ""].join("\n"),
		);
		expect(rows).toEqual([]);
	});
});
