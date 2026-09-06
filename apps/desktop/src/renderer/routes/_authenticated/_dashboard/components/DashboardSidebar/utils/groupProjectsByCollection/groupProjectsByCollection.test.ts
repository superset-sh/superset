import { describe, expect, it } from "bun:test";
import type {
	DashboardSidebarCollection,
	DashboardSidebarProject,
} from "../../types";
import { groupProjectsByCollection } from "./groupProjectsByCollection";

function collection(id: string): DashboardSidebarCollection {
	return {
		id,
		name: id,
		isCollapsed: false,
		tabOrder: 1,
		color: null,
		icon: null,
	};
}

function project(
	id: string,
	collectionId: string | null,
): DashboardSidebarProject {
	return {
		id,
		name: id,
		githubOwner: null,
		githubRepoName: null,
		iconUrl: null,
		color: null,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		isCollapsed: false,
		collectionId,
		children: [],
	};
}

describe("groupProjectsByCollection", () => {
	it("buckets projects under their collections, preserving order", () => {
		const { collectionsWithProjects, ungroupedProjects } =
			groupProjectsByCollection(
				[collection("a"), collection("b")],
				[project("p1", "b"), project("p2", null), project("p3", "b")],
			);
		expect(collectionsWithProjects.map((f) => f.collection.id)).toEqual([
			"a",
			"b",
		]);
		expect(collectionsWithProjects[1]?.projects.map((p) => p.id)).toEqual([
			"p1",
			"p3",
		]);
		expect(collectionsWithProjects[0]?.projects).toEqual([]);
		expect(ungroupedProjects.map((p) => p.id)).toEqual(["p2"]);
	});

	it("falls a project back to the root when its collection no longer exists", () => {
		const { collectionsWithProjects, ungroupedProjects } =
			groupProjectsByCollection(
				[collection("a")],
				[project("p1", "deleted-collection")],
			);
		expect(collectionsWithProjects[0]?.projects).toEqual([]);
		expect(ungroupedProjects.map((p) => p.id)).toEqual(["p1"]);
	});

	it("keeps every collection present even when empty", () => {
		const { collectionsWithProjects } = groupProjectsByCollection(
			[collection("a"), collection("b")],
			[],
		);
		expect(collectionsWithProjects).toHaveLength(2);
	});
});
