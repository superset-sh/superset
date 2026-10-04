import { describe, expect, test } from "bun:test";
import {
	activeCellRange,
	collapsed,
	moveSelection,
	normalizeSelection,
	type Selection,
	selectionRange,
} from "./selection";

const bounds = { rows: 100, cols: 5 };
const at = (row: number, col: number) => collapsed({ row, col });
const press = (
	selection: Selection,
	key: string,
	modifiers: { shiftKey?: boolean; primaryKey?: boolean } = {},
) =>
	moveSelection(
		selection,
		{ key, shiftKey: false, primaryKey: false, ...modifiers },
		bounds,
		20,
	);

describe("moveSelection", () => {
	test("arrows move the active cell and stop at the grid edge", () => {
		expect(press(at(3, 2), "ArrowDown")).toEqual(at(4, 2));
		expect(press(at(0, 0), "ArrowUp")).toEqual(at(0, 0));
		expect(press(at(0, 4), "ArrowRight")).toEqual(at(0, 4));
	});

	test("Shift extends from the head and keeps the active cell", () => {
		const once = press(at(3, 2), "ArrowDown", { shiftKey: true });
		expect(once).toEqual({
			anchor: { row: 3, col: 2 },
			head: { row: 4, col: 2 },
		});
		expect(once && press(once, "ArrowRight", { shiftKey: true })).toEqual({
			anchor: { row: 3, col: 2 },
			head: { row: 4, col: 3 },
		});
	});

	test("Cmd+arrow jumps to the edge of the data, with Shift selecting up to it", () => {
		expect(press(at(3, 2), "ArrowDown", { primaryKey: true })).toEqual(
			at(99, 2),
		);
		expect(press(at(3, 2), "ArrowLeft", { primaryKey: true })).toEqual(
			at(3, 0),
		);
		expect(
			press(at(3, 2), "ArrowRight", { primaryKey: true, shiftKey: true }),
		).toEqual({ anchor: { row: 3, col: 2 }, head: { row: 3, col: 4 } });
	});

	test("Tab, Enter and paging collapse the selection around the active cell", () => {
		const range = { anchor: { row: 3, col: 2 }, head: { row: 6, col: 4 } };
		expect(press(range, "Tab")).toEqual(at(3, 3));
		expect(press(range, "Tab", { shiftKey: true })).toEqual(at(3, 1));
		expect(press(range, "Enter")).toEqual(at(4, 2));
		expect(press(range, "Enter", { shiftKey: true })).toEqual(at(2, 2));
		expect(press(at(90, 1), "PageDown")).toEqual(at(99, 1));
		expect(press(at(30, 1), "PageUp")).toEqual(at(10, 1));
		expect(press(at(30, 3), "Home", { primaryKey: true })).toEqual(at(0, 0));
		expect(press(at(30, 3), "End", { primaryKey: true })).toEqual(at(99, 4));
	});

	test("ignores keys it does not own", () => {
		expect(press(at(0, 0), "a")).toBeNull();
	});
});

describe("merged cells", () => {
	// A1:C1 and B3:B4
	const merges = [
		{ top: 0, left: 0, bottom: 0, right: 2 },
		{ top: 2, left: 1, bottom: 3, right: 1 },
	];
	const pressIn = (selection: Selection, key: string, shiftKey = false) =>
		moveSelection(
			selection,
			{ key, shiftKey, primaryKey: false },
			bounds,
			20,
			merges,
		);

	test("a click inside a merge makes its top-left cell active", () => {
		const selection = normalizeSelection(at(0, 1), merges);
		expect(selection).toEqual(at(0, 0));
		expect(selectionRange(selection, merges)).toEqual(merges[0]);
		expect(activeCellRange(selection, merges)).toEqual(merges[0]);
	});

	test("a range grows to cover every merge it cuts", () => {
		const selection = { anchor: { row: 1, col: 2 }, head: { row: 2, col: 1 } };
		expect(selectionRange(selection, merges)).toEqual({
			top: 1,
			left: 1,
			bottom: 3,
			right: 2,
		});
		const across = { anchor: { row: 1, col: 1 }, head: { row: 0, col: 1 } };
		expect(selectionRange(across, merges)).toEqual({
			top: 0,
			left: 0,
			bottom: 1,
			right: 2,
		});
	});

	test("moving out of a merge steps past its far edge", () => {
		expect(pressIn(at(0, 0), "ArrowRight")).toEqual(at(0, 3));
		expect(pressIn(at(0, 0), "Tab")).toEqual(at(0, 3));
		expect(pressIn(at(2, 1), "ArrowDown")).toEqual(at(4, 1));
		expect(pressIn(at(2, 1), "Enter")).toEqual(at(4, 1));
		expect(pressIn(at(1, 1), "ArrowDown")).toEqual(at(2, 1));
		expect(pressIn(at(1, 2), "ArrowUp")).toEqual(at(0, 0));
		expect(pressIn(at(4, 1), "ArrowUp")).toEqual(at(2, 1));
	});
});
