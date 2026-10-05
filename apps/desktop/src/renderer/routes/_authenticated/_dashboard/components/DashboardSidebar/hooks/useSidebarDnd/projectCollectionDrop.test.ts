import { describe, expect, test } from "bun:test";
import {
	collectionDropId,
	PROJECT_COLLECTION_ROOT_DROP,
	type ProjectCollectionDragLayout,
	planProjectCollectionDrop,
} from "./projectCollectionDrop";

const layout: ProjectCollectionDragLayout = {
	rootKeys: ["root-a", "projects:team", "root-b", "projects:personal"],
	collections: [
		{ id: "projects:team", tag: "team", projectIds: ["a", "b", "c"] },
		{ id: "projects:personal", tag: "personal", projectIds: [] },
	],
};

describe("project collection drops", () => {
	test("reorders root projects and collections together", () => {
		expect(
			planProjectCollectionDrop(layout, "projects:team", "root-b"),
		).toEqual({
			type: "reorder",
			keys: ["root-a", "root-b", "projects:team", "projects:personal"],
		});
	});
	test("moves a root project onto a collection header", () => {
		expect(
			planProjectCollectionDrop(
				layout,
				"root-a",
				collectionDropId("projects:team"),
			),
		).toEqual({
			type: "move",
			projectIds: ["root-a"],
			tag: "team",
			index: 3,
			beforeKey: null,
		});
		expect(
			planProjectCollectionDrop(layout, "root-a", "projects:team"),
		).toEqual({
			type: "reorder",
			keys: ["projects:team", "root-a", "root-b", "projects:personal"],
		});
	});
	test("moves into an empty collection", () => {
		expect(
			planProjectCollectionDrop(
				layout,
				"a",
				collectionDropId("projects:personal"),
			),
		).toEqual({
			type: "move",
			projectIds: ["a"],
			tag: "personal",
			index: 0,
			beforeKey: null,
		});
	});
	test("inserts across collections at the hovered project", () => {
		const two = {
			...layout,
			collections: [
				...layout.collections,
				{ id: "projects:other", tag: "other", projectIds: ["d", "e"] },
			],
		};
		expect(planProjectCollectionDrop(two, "a", "e")).toEqual({
			type: "move",
			projectIds: ["a"],
			tag: "other",
			index: 1,
			beforeKey: "e",
		});
	});
	test("reorders inside a collection", () => {
		expect(planProjectCollectionDrop(layout, "a", "c")).toEqual({
			type: "reorder",
			keys: ["b", "c", "a"],
		});
	});
	test("returns a member to a root position", () => {
		expect(planProjectCollectionDrop(layout, "a", "root-b")).toEqual({
			type: "move",
			projectIds: ["a"],
			tag: null,
			index: 2,
			beforeKey: "root-b",
		});
	});
	test("returns a member to the end of the root", () => {
		expect(
			planProjectCollectionDrop(layout, "a", PROJECT_COLLECTION_ROOT_DROP),
		).toEqual({
			type: "move",
			projectIds: ["a"],
			tag: null,
			index: 4,
			beforeKey: null,
		});
	});
	test("reorders a collection over a member of another collection", () => {
		const two = {
			...layout,
			collections: [
				{ id: "projects:team", tag: "team", projectIds: ["a", "b", "c"] },
				{ id: "projects:personal", tag: "personal", projectIds: ["d"] },
			],
		};
		expect(planProjectCollectionDrop(two, "projects:team", "d")).toEqual({
			type: "reorder",
			keys: ["root-a", "root-b", "projects:personal", "projects:team"],
		});
	});
	test("ignores unchanged and invalid targets", () => {
		expect(planProjectCollectionDrop(layout, "a", "a")).toBeNull();
		expect(planProjectCollectionDrop(layout, "a", "unrelated")).toBeNull();
		expect(
			planProjectCollectionDrop(
				layout,
				"projects:team",
				collectionDropId("projects:team"),
			),
		).toBeNull();
	});
});

test("a root project can be reordered above a collection", () => {
	expect(planProjectCollectionDrop(layout, "root-b", "projects:team")).toEqual({
		type: "reorder",
		keys: ["root-a", "root-b", "projects:team", "projects:personal"],
	});
});

test("a member can return to root above a collection without entering it", () => {
	expect(
		planProjectCollectionDrop(layout, "a", "projects:personal"),
	).toMatchObject({
		type: "move",
		projectIds: ["a"],
		tag: null,
		beforeKey: "projects:personal",
	});
});

test("icon rail reorder cannot add or remove project membership", () => {
	expect(
		planProjectCollectionDrop(
			{ ...layout, isRail: true } as ProjectCollectionDragLayout,
			"a",
			"root-b",
		),
	).toEqual({
		type: "reorder",
		keys: ["b", "c", "a"],
	});
	expect(
		planProjectCollectionDrop(
			{ ...layout, isRail: true } as ProjectCollectionDragLayout,
			"root-a",
			"a",
		)?.type,
	).toBe("reorder");
});

test("a root project on a legacy host cannot be dragged into a collection", () => {
	expect(
		planProjectCollectionDrop(
			{
				...layout,
				immovableProjectIds: ["root-a"],
			} as ProjectCollectionDragLayout,
			"root-a",
			collectionDropId("projects:team"),
		),
	).toBeNull();
});

for (const isRail of [false, true]) {
	test(`an offline or legacy root project can reorder with rail=${isRail}`, () => {
		expect(
			planProjectCollectionDrop(
				{ ...layout, isRail, immovableProjectIds: ["root-b"] },
				"root-b",
				"root-a",
			)?.type,
		).toBe("reorder");
	});
}

test("an offline collection member can reorder without changing membership", () => {
	expect(
		planProjectCollectionDrop(
			{ ...layout, immovableProjectIds: ["a"] },
			"a",
			"c",
		),
	).toEqual({ type: "reorder", keys: ["b", "c", "a"] });
	expect(
		planProjectCollectionDrop(
			{ ...layout, immovableProjectIds: ["a"] },
			"a",
			"root-b",
		),
	).toBeNull();
});

for (const [active, over, expected] of [
	["a", "root-a", null],
	["c", "root-a", ["c", "a", "b"]],
	["a", "root-b", ["b", "c", "a"]],
	["c", "root-b", null],
	["root-a", "b", ["projects:team", "root-a", "root-b", "projects:personal"]],
	["root-b", "b", ["root-a", "root-b", "projects:team", "projects:personal"]],
] as const) {
	test(`rail drop ${active} over ${over} stays in its own container`, () => {
		const command = planProjectCollectionDrop(
			{ ...layout, isRail: true },
			active,
			over,
		);
		if (expected === null) expect(command).toBeNull();
		else expect(command).toEqual({ type: "reorder", keys: [...expected] });
	});
}
