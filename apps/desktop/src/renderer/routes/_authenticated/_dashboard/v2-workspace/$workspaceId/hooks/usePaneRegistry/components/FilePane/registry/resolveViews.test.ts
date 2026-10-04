import { describe, expect, test } from "bun:test";
import { resolveViews } from "./resolveViews";

const ids = (filePath: string, isBinary = false) =>
	resolveViews(filePath, { isBinary }).map((view) => view.id);

describe("resolveViews", () => {
	test("delimited text opens as a table with the raw text one toggle away", () => {
		expect(ids("data/sales.csv")).toEqual(["table", "code"]);
		expect(ids("export.tsv")).toEqual(["table", "code"]);
	});

	test("workbooks only open in the spreadsheet view", () => {
		expect(ids("sales.xlsx", true)).toEqual(["spreadsheet"]);
		expect(ids("legacy.xls", true)).toEqual(["spreadsheet"]);
		expect(ids("budget.ods", true)).toEqual(["spreadsheet"]);
	});
});
