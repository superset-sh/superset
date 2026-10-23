import { describe, expect, it } from "bun:test";
import {
	makeProject,
	makeSection,
	makeWorkspace,
} from "../testProjectFixtures";
import { filterEmptyDashboardSidebarProjects } from "./filterEmptyDashboardSidebarProjects";

const withRow = makeProject({
	id: "p-row",
	name: "Row",
	children: [
		{
			type: "workspace",
			workspace: makeWorkspace({ id: "w1", name: "fix", projectId: "p-row" }),
		},
	],
});
const withFolderMember = makeProject({
	id: "p-folder",
	name: "Folder",
	children: [
		{
			type: "section",
			section: makeSection({
				id: "s1",
				name: "Backend",
				workspaces: [
					makeWorkspace({ id: "w2", name: "api", projectId: "p-folder" }),
				],
			}),
		},
	],
});
const withEmptyFolder = makeProject({
	id: "p-empty-folder",
	name: "Empty folder",
	children: [
		{ type: "section", section: makeSection({ id: "s2", name: "Old" }) },
	],
});
const empty = makeProject({ id: "p-empty", name: "Empty" });
const projects = [withEmptyFolder, withRow, empty, withFolderMember];
const ready = {
	pinnedWorkspaces: [],
	unsettledProjectIds: [],
	isReady: true,
};

describe("filterEmptyDashboardSidebarProjects", () => {
	it("keeps every project, by reference, until the data is ready", () => {
		const result = filterEmptyDashboardSidebarProjects(projects, {
			...ready,
			isReady: false,
		});
		expect(result.projects).toBe(projects);
		expect(result.hiddenCount).toBe(0);
	});

	it("drops projects with no workspace, counting folder members and keeping order", () => {
		const result = filterEmptyDashboardSidebarProjects(projects, ready);
		expect(result.projects).toEqual([withRow, withFolderMember]);
		expect(result.projects[0]).toBe(withRow);
		expect(result.hiddenCount).toBe(2);
	});

	it("keeps a project whose only workspace is pinned", () => {
		const result = filterEmptyDashboardSidebarProjects(projects, {
			...ready,
			pinnedWorkspaces: [{ projectId: "p-empty" }, { projectId: null }],
		});
		expect(result.projects.map((project) => project.id)).toEqual([
			"p-row",
			"p-empty",
			"p-folder",
		]);
	});

	it("keeps a project that may hold a workspace not shown yet", () => {
		const result = filterEmptyDashboardSidebarProjects(projects, {
			...ready,
			unsettledProjectIds: ["p-empty-folder"],
		});
		expect(result.projects.map((project) => project.id)).toEqual([
			"p-empty-folder",
			"p-row",
			"p-folder",
		]);
		expect(result.hiddenCount).toBe(1);
	});

	it("returns the input array when no project is empty", () => {
		const occupied = [withRow, withFolderMember];
		const result = filterEmptyDashboardSidebarProjects(occupied, ready);
		expect(result.projects).toBe(occupied);
		expect(result.hiddenCount).toBe(0);
	});
});
