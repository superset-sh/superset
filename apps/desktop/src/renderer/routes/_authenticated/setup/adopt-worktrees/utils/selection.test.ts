import { describe, expect, test } from "bun:test";
import {
	countSelected,
	initializeProjectSelection,
	type SelectionState,
	togglePathInSelection,
	toggleProjectInSelection,
} from "./selection";

describe("togglePathInSelection", () => {
	test("adds path to an empty project entry", () => {
		const next = togglePathInSelection({}, "p1", "/wt/a");
		expect(Array.from(next.p1)).toEqual(["/wt/a"]);
	});

	test("adds path to an existing project entry without disturbing others", () => {
		const prev: SelectionState = {
			p1: new Set(["/wt/a"]),
			p2: new Set(["/wt/x", "/wt/y"]),
		};
		const next = togglePathInSelection(prev, "p1", "/wt/b");
		expect(Array.from(next.p1).sort()).toEqual(["/wt/a", "/wt/b"]);
		expect(Array.from(next.p2).sort()).toEqual(["/wt/x", "/wt/y"]);
	});

	test("removes path that's already in the set", () => {
		const prev: SelectionState = { p1: new Set(["/wt/a", "/wt/b"]) };
		const next = togglePathInSelection(prev, "p1", "/wt/a");
		expect(Array.from(next.p1)).toEqual(["/wt/b"]);
	});

	test("does not mutate the previous state", () => {
		const prev: SelectionState = { p1: new Set(["/wt/a"]) };
		const next = togglePathInSelection(prev, "p1", "/wt/b");
		expect(Array.from(prev.p1)).toEqual(["/wt/a"]);
		expect(next).not.toBe(prev);
		expect(next.p1).not.toBe(prev.p1);
	});

	test("toggling the same path twice returns to the original size", () => {
		let state: SelectionState = { p1: new Set(["/wt/a"]) };
		state = togglePathInSelection(state, "p1", "/wt/b");
		state = togglePathInSelection(state, "p1", "/wt/b");
		expect(Array.from(state.p1)).toEqual(["/wt/a"]);
	});
});

describe("toggleProjectInSelection", () => {
	test("selects all when current is empty", () => {
		const next = toggleProjectInSelection({}, "p1", [
			"/wt/a",
			"/wt/b",
			"/wt/c",
		]);
		expect(Array.from(next.p1).sort()).toEqual(["/wt/a", "/wt/b", "/wt/c"]);
	});

	test("selects all when current is partially selected", () => {
		const prev: SelectionState = { p1: new Set(["/wt/a"]) };
		const next = toggleProjectInSelection(prev, "p1", [
			"/wt/a",
			"/wt/b",
			"/wt/c",
		]);
		expect(Array.from(next.p1).sort()).toEqual(["/wt/a", "/wt/b", "/wt/c"]);
	});

	test("deselects all when every path is currently selected", () => {
		const prev: SelectionState = {
			p1: new Set(["/wt/a", "/wt/b", "/wt/c"]),
		};
		const next = toggleProjectInSelection(prev, "p1", [
			"/wt/a",
			"/wt/b",
			"/wt/c",
		]);
		expect(Array.from(next.p1)).toEqual([]);
	});

	test("does not affect other projects", () => {
		const prev: SelectionState = {
			p1: new Set(["/wt/a"]),
			p2: new Set(["/wt/x", "/wt/y"]),
		};
		const next = toggleProjectInSelection(prev, "p1", ["/wt/a", "/wt/b"]);
		expect(Array.from(next.p2).sort()).toEqual(["/wt/x", "/wt/y"]);
	});

	test("with empty path list, treats as 'select all' (i.e. clears the entry to a fresh empty set)", () => {
		const prev: SelectionState = { p1: new Set(["/wt/a"]) };
		const next = toggleProjectInSelection(prev, "p1", []);
		expect(Array.from(next.p1)).toEqual([]);
	});
});

describe("countSelected", () => {
	test("returns 0 for empty state", () => {
		expect(countSelected({})).toBe(0);
	});

	test("sums sizes across projects", () => {
		const state: SelectionState = {
			p1: new Set(["/wt/a", "/wt/b"]),
			p2: new Set(["/wt/x"]),
			p3: new Set(),
		};
		expect(countSelected(state)).toBe(3);
	});
});

describe("initializeProjectSelection", () => {
	test("creates a new entry with all provided paths", () => {
		const next = initializeProjectSelection({}, "p1", ["/wt/a", "/wt/b"]);
		expect(Array.from(next.p1).sort()).toEqual(["/wt/a", "/wt/b"]);
	});

	test("does not overwrite an existing entry (idempotent for re-fires)", () => {
		const prev: SelectionState = { p1: new Set(["/wt/a"]) };
		const next = initializeProjectSelection(prev, "p1", [
			"/wt/a",
			"/wt/b",
			"/wt/c",
		]);
		expect(next).toBe(prev);
		expect(Array.from(next.p1)).toEqual(["/wt/a"]);
	});

	test("initializing with no paths creates an empty set", () => {
		const next = initializeProjectSelection({}, "p1", []);
		expect(next.p1).toBeDefined();
		expect(next.p1.size).toBe(0);
	});
});
