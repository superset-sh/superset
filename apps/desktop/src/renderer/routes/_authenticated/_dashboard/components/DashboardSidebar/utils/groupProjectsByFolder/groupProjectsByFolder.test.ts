import { describe, expect, it } from "bun:test";
import type {
	DashboardSidebarFolder,
	DashboardSidebarProject,
} from "../../types";
import { groupProjectsByFolder } from "./groupProjectsByFolder";

function folder(id: string): DashboardSidebarFolder {
	return {
		id,
		name: id,
		isCollapsed: false,
		tabOrder: 1,
		color: null,
		icon: null,
	};
}

function project(id: string, folderId: string | null): DashboardSidebarProject {
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
		folderId,
		children: [],
	};
}

describe("groupProjectsByFolder", () => {
	it("buckets projects under their folders, preserving order", () => {
		const { foldersWithProjects, ungroupedProjects } = groupProjectsByFolder(
			[folder("a"), folder("b")],
			[project("p1", "b"), project("p2", null), project("p3", "b")],
		);
		expect(foldersWithProjects.map((f) => f.folder.id)).toEqual(["a", "b"]);
		expect(foldersWithProjects[1]?.projects.map((p) => p.id)).toEqual([
			"p1",
			"p3",
		]);
		expect(foldersWithProjects[0]?.projects).toEqual([]);
		expect(ungroupedProjects.map((p) => p.id)).toEqual(["p2"]);
	});

	it("falls a project back to the root when its folder no longer exists", () => {
		const { foldersWithProjects, ungroupedProjects } = groupProjectsByFolder(
			[folder("a")],
			[project("p1", "deleted-folder")],
		);
		expect(foldersWithProjects[0]?.projects).toEqual([]);
		expect(ungroupedProjects.map((p) => p.id)).toEqual(["p1"]);
	});

	it("keeps every folder present even when empty", () => {
		const { foldersWithProjects } = groupProjectsByFolder(
			[folder("a"), folder("b")],
			[],
		);
		expect(foldersWithProjects).toHaveLength(2);
	});
});
