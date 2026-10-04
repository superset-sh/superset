import { expect, test } from "bun:test";
import {
	columnAtOffset,
	columnName,
	columnStarts,
	rangeAddress,
	revealOffset,
} from "./gridGeometry";

test("names columns and ranges the way spreadsheets do", () => {
	expect([0, 25, 26, 51, 701, 702, 16383].map(columnName)).toEqual([
		"A",
		"Z",
		"AA",
		"AZ",
		"ZZ",
		"AAA",
		"XFD",
	]);
	expect(rangeAddress({ top: 3, left: 1, bottom: 3, right: 1 })).toBe("B4");
	expect(rangeAddress({ top: 0, left: 0, bottom: 9, right: 2 })).toBe("A1:C10");
});

test("finds the column under an offset", () => {
	const starts = columnStarts([50, 100, 30]);
	expect(starts).toEqual([0, 50, 150, 180]);
	expect(
		[0, 49, 50, 149, 150, 500].map((x) => columnAtOffset(starts, x)),
	).toEqual([0, 0, 1, 1, 2, 2]);
});

test("scrolls only as far as needed to clear the sticky header", () => {
	expect(revealOffset(100, 124, 0, 300, 24)).toBeNull();
	expect(revealOffset(100, 124, 90, 300, 24)).toBe(76);
	expect(revealOffset(400, 424, 0, 300, 24)).toBe(124);
});
