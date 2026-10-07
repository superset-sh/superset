import { expect, test } from "bun:test";
import { executeRows } from "./execute-rows";

test("reads transaction IDs from postgres-js rows with result metadata", () => {
	const rows = Object.assign([{ txid: "123" }], {
		count: 1,
		command: "SELECT",
	});
	expect(executeRows<{ txid: string }>(rows)[0]?.txid).toBe("123");
});

test("reads transaction IDs from a Neon result", () => {
	const rows = [{ txid: "456" }];
	expect(executeRows<{ txid: string }>({ rows, rowCount: 1 })[0]?.txid).toBe(
		"456",
	);
});

test("preserves an empty result from either driver", () => {
	const rows: unknown[] = [];
	expect(executeRows(rows)).toEqual([]);
	expect(executeRows({ rows })).toEqual([]);
});

test("returns no rows for results without a row array", () => {
	for (const result of [
		undefined,
		null,
		{},
		{ rows: null },
		{ rows: "invalid" },
	])
		expect(executeRows(result)).toEqual([]);
});
