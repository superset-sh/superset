import { describe, expect, test } from "bun:test";
import type {
	ProjectCollection,
	ProjectCollectionRootItem,
} from "renderer/routes/_authenticated/utils/projectCollections/projectCollections";
import {
	buildSidebarRailItems,
	type SidebarRailItem,
} from "./buildSidebarRailItems";

type Project = { id: string };

function collection(
	id: string,
	projectIds: string[],
	overrides: Partial<ProjectCollection<Project>> = {},
): ProjectCollectionRootItem<Project> {
	return {
		type: "collection",
		tabOrder: 0,
		collection: {
			id: `projects:${id}`,
			tag: id,
			name: id.toUpperCase(),
			color: null,
			tabOrder: 0,
			isCollapsed: false,
			projects: projectIds.map((projectId) => ({ id: projectId })),
			...overrides,
		},
	};
}

function root(id: string): ProjectCollectionRootItem<Project> {
	return { type: "project", project: { id }, tabOrder: 0 };
}

function describeItems(items: SidebarRailItem<Project>[]) {
	return items.map((item) => {
		if (item.type === "project") return item.project.id;
		if (item.type === "collectionSeparator")
			return `[${item.collection.name}:${item.collection.color ?? "default"}]`;
		return "[root]";
	});
}

describe("sidebar rail items", () => {
	test("marks the start of each collection and the return to the root", () => {
		const items = [
			root("r1"),
			collection("team", ["a", "b"], { color: "#ef4444" }),
			collection("perso", ["c"]),
			root("r2"),
			root("r3"),
		];
		const order = ["r1", "a", "b", "c", "r2", "r3"].map((id) => ({ id }));
		expect(describeItems(buildSidebarRailItems(order, items))).toEqual([
			"r1",
			"[TEAM:#ef4444]",
			"a",
			"b",
			"[PERSO:default]",
			"c",
			"[root]",
			"r2",
			"r3",
		]);
	});

	test("keeps projects of a collapsed collection and skips empty collections", () => {
		const items = [
			collection("team", ["a"], { isCollapsed: true }),
			collection("empty", []),
		];
		expect(describeItems(buildSidebarRailItems([{ id: "a" }], items))).toEqual([
			"[TEAM:default]",
			"a",
		]);
	});

	test("adds no separators when no project is in a collection", () => {
		const items = [root("r1"), root("r2")];
		const order = [{ id: "r1" }, { id: "r2" }];
		expect(describeItems(buildSidebarRailItems(order, items))).toEqual([
			"r1",
			"r2",
		]);
	});

	test("gives every item a unique key", () => {
		const items = [collection("team", ["a"]), root("r1")];
		const order = [{ id: "a" }, { id: "r1" }];
		const keys = buildSidebarRailItems(order, items).map((item) => item.key);
		expect(new Set(keys).size).toBe(keys.length);
	});
});
