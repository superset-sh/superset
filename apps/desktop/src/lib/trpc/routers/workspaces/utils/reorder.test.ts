import { describe, expect, test } from "bun:test";
import { computeNextTabOrder, reorderItems } from "./reorder";

function makeItems(...tabOrders: number[]) {
	return tabOrders.map((t, i) => ({ id: `item-${i}`, tabOrder: t }));
}

describe("reorderItems", () => {
	test("move forward (0→2)", () => {
		const items = makeItems(0, 1, 2);
		reorderItems(items, 0, 2);
		expect(items.map((i) => i.id)).toEqual(["item-1", "item-2", "item-0"]);
		expect(items.map((i) => i.tabOrder)).toEqual([0, 1, 2]);
	});

	test("move backward (2→0)", () => {
		const items = makeItems(0, 1, 2);
		reorderItems(items, 2, 0);
		expect(items.map((i) => i.id)).toEqual(["item-2", "item-0", "item-1"]);
		expect(items.map((i) => i.tabOrder)).toEqual([0, 1, 2]);
	});

	test("same position is a noop", () => {
		const items = makeItems(0, 1, 2);
		reorderItems(items, 1, 1);
		expect(items.map((i) => i.id)).toEqual(["item-0", "item-1", "item-2"]);
		expect(items.map((i) => i.tabOrder)).toEqual([0, 1, 2]);
	});

	test("two items swap", () => {
		const items = makeItems(0, 1);
		reorderItems(items, 0, 1);
		expect(items.map((i) => i.id)).toEqual(["item-1", "item-0"]);
		expect(items.map((i) => i.tabOrder)).toEqual([0, 1]);
	});

	test("single item list", () => {
		const items = makeItems(0);
		reorderItems(items, 0, 0);
		expect(items.map((i) => i.id)).toEqual(["item-0"]);
		expect(items.map((i) => i.tabOrder)).toEqual([0]);
	});

	test("normalizes non-sequential tabOrders", () => {
		const items = makeItems(5, 10, 20);
		reorderItems(items, 2, 0);
		expect(items.map((i) => i.tabOrder)).toEqual([0, 1, 2]);
	});

	test("throws on negative index", () => {
		const items = makeItems(0, 1);
		expect(() => reorderItems(items, -1, 0)).toThrow(
			"Invalid fromIndex or toIndex",
		);
	});

	test("throws on out-of-bounds index", () => {
		const items = makeItems(0, 1);
		expect(() => reorderItems(items, 0, 5)).toThrow(
			"Invalid fromIndex or toIndex",
		);
	});

	test("throws on empty array", () => {
		expect(() => reorderItems([], 0, 0)).toThrow(
			"Cannot reorder an empty array",
		);
	});
});

describe("computeNextTabOrder", () => {
	test("empty list returns 0", () => {
		expect(computeNextTabOrder([])).toBe(0);
	});

	test("sequential returns next", () => {
		expect(computeNextTabOrder([0, 1, 2])).toBe(3);
	});

	test("gaps returns max + 1", () => {
		expect(computeNextTabOrder([0, 5, 3])).toBe(6);
	});

	test("single item returns item + 1", () => {
		expect(computeNextTabOrder([0])).toBe(1);
	});
});
