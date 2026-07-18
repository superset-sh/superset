import { describe, expect, test } from "bun:test";
import {
	buildProjectLane,
	type LaneItem,
	moveLaneItem,
	requireSingleMoveTarget,
} from "./laneOrder";

function lane(...ids: string[]): LaneItem[] {
	return ids.map((id, index) => ({
		type: id.startsWith("sec") ? "section" : "workspace",
		id,
		tabOrder: index + 1,
	}));
}

function ids(items: LaneItem[]): string[] {
	return items.map((item) => item.id);
}

describe("moveLaneItem", () => {
	test("--up swaps with the previous item and clamps at the top", () => {
		expect(ids(moveLaneItem(lane("a", "b", "c"), "b", { up: true }))).toEqual([
			"b",
			"a",
			"c",
		]);
		expect(ids(moveLaneItem(lane("a", "b"), "a", { up: true }))).toEqual([
			"a",
			"b",
		]);
	});

	test("--down swaps with the next item and clamps at the bottom", () => {
		expect(ids(moveLaneItem(lane("a", "b", "c"), "b", { down: true }))).toEqual(
			["a", "c", "b"],
		);
		expect(ids(moveLaneItem(lane("a", "b"), "b", { down: true }))).toEqual([
			"a",
			"b",
		]);
	});

	test("--top and --bottom", () => {
		expect(ids(moveLaneItem(lane("a", "b", "c"), "c", { top: true }))).toEqual([
			"c",
			"a",
			"b",
		]);
		expect(
			ids(moveLaneItem(lane("a", "b", "c"), "a", { bottom: true })),
		).toEqual(["b", "c", "a"]);
	});

	test("--after places the item directly under the target, both directions", () => {
		expect(
			ids(moveLaneItem(lane("a", "b", "c"), "a", { afterId: "c" })),
		).toEqual(["b", "c", "a"]);
		expect(
			ids(moveLaneItem(lane("a", "b", "c"), "c", { afterId: "a" })),
		).toEqual(["a", "c", "b"]);
	});

	test("throws when the item or --after target is missing", () => {
		expect(() => moveLaneItem(lane("a"), "x", { up: true })).toThrow(
			"not found",
		);
		expect(() => moveLaneItem(lane("a", "b"), "a", { afterId: "x" })).toThrow(
			"not in the same list",
		);
	});
});

describe("requireSingleMoveTarget", () => {
	test("accepts exactly one flag, rejects zero or several", () => {
		expect(() => requireSingleMoveTarget({ up: true })).not.toThrow();
		expect(() => requireSingleMoveTarget({})).toThrow("exactly one");
		expect(() => requireSingleMoveTarget({ up: true, down: true })).toThrow(
			"exactly one",
		);
	});
});

describe("buildProjectLane", () => {
	test("interleaves ungrouped workspaces and sections, sections-first on ties", () => {
		const items = buildProjectLane(
			[
				{ id: "w1", projectId: "p", sectionId: null, tabOrder: 1 },
				{ id: "grouped", projectId: "p", sectionId: "sec1", tabOrder: 1 },
				{ id: "other", projectId: "q", sectionId: null, tabOrder: 1 },
				{ id: "w2", projectId: "p", sectionId: null, tabOrder: 2 },
			],
			[{ id: "sec1", projectId: "p", tabOrder: 2 }],
			"p",
		);
		expect(ids(items)).toEqual(["w1", "sec1", "w2"]);
	});
});
