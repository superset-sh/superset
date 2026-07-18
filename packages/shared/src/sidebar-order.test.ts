import { describe, expect, it } from "bun:test";
import {
	compareTopLevelItems,
	getFirstSectionIndex,
	getNextTabOrder,
	getPrependTabOrder,
	type TopLevelItem,
} from "./sidebar-order";

function ws(id: string, tabOrder: number): TopLevelItem {
	return { type: "workspace", id, tabOrder };
}

function sec(id: string, tabOrder: number): TopLevelItem {
	return { type: "section", id, tabOrder };
}

describe("getNextTabOrder", () => {
	it("appends after the max", () => {
		expect(getNextTabOrder([{ tabOrder: 3 }, { tabOrder: 7 }])).toBe(8);
	});

	it("returns 1 for an empty lane", () => {
		expect(getNextTabOrder([])).toBe(1);
	});
});

describe("getPrependTabOrder", () => {
	it("prepends before the min, including negatives", () => {
		expect(getPrependTabOrder([{ tabOrder: -2 }, { tabOrder: 5 }])).toBe(-3);
	});

	it("returns 1 for an empty lane", () => {
		expect(getPrependTabOrder([])).toBe(1);
	});
});

describe("compareTopLevelItems", () => {
	it("sorts by tabOrder ascending", () => {
		expect(compareTopLevelItems(ws("a", 2), sec("b", 1))).toBeGreaterThan(0);
	});

	it("puts sections before workspaces on ties", () => {
		expect(compareTopLevelItems(sec("s", 1), ws("w", 1))).toBeLessThan(0);
		expect(compareTopLevelItems(ws("w", 1), sec("s", 1))).toBeGreaterThan(0);
	});
});

describe("getFirstSectionIndex", () => {
	it("finds the boundary above the first section", () => {
		expect(getFirstSectionIndex([ws("a", 1), sec("s", 2), ws("b", 3)])).toBe(1);
	});

	it("returns the lane length when there are no sections", () => {
		expect(getFirstSectionIndex([ws("a", 1), ws("b", 2)])).toBe(2);
	});
});
