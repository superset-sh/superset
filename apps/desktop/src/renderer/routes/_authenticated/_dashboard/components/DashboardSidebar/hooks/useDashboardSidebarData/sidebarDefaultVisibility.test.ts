import { describe, expect, it } from "bun:test";
import {
	buildSidebarProjects,
	type SidebarProjectRow,
	shouldIncludeSidebarWorkspace,
} from "./sidebarDefaultVisibility";

const userId = "user-1";

describe("shouldIncludeSidebarWorkspace", () => {
	it("includes workspaces with explicit local sidebar state", () => {
		expect(
			shouldIncludeSidebarWorkspace(
				{
					type: "main",
					createdByUserId: null,
					hasUserHostAccess: false,
					hasLocalSidebarState: true,
				},
				userId,
			),
		).toBe(true);
	});

	it("defaults current-user worktree workspaces visible when host is accessible", () => {
		expect(
			shouldIncludeSidebarWorkspace(
				{
					type: "worktree",
					createdByUserId: userId,
					hasUserHostAccess: true,
					hasLocalSidebarState: false,
				},
				userId,
			),
		).toBe(true);
	});

	it("does not default main, inaccessible, or other-user workspaces visible", () => {
		expect(
			shouldIncludeSidebarWorkspace(
				{
					type: "main",
					createdByUserId: userId,
					hasUserHostAccess: true,
					hasLocalSidebarState: false,
				},
				userId,
			),
		).toBe(false);
		expect(
			shouldIncludeSidebarWorkspace(
				{
					type: "worktree",
					createdByUserId: userId,
					hasUserHostAccess: false,
					hasLocalSidebarState: false,
				},
				userId,
			),
		).toBe(false);
		expect(
			shouldIncludeSidebarWorkspace(
				{
					type: "worktree",
					createdByUserId: "user-2",
					hasUserHostAccess: true,
					hasLocalSidebarState: false,
				},
				userId,
			),
		).toBe(false);
		expect(
			shouldIncludeSidebarWorkspace(
				{
					type: "worktree",
					createdByUserId: null,
					hasUserHostAccess: true,
					hasLocalSidebarState: false,
				},
				null,
			),
		).toBe(false);
	});
});

describe("buildSidebarProjects", () => {
	const date = new Date("2026-01-01T00:00:00.000Z");
	const explicitProject: SidebarProjectRow = {
		id: "project-explicit",
		name: "Explicit",
		slug: "explicit",
		githubRepositoryId: null,
		githubOwner: null,
		githubRepoName: null,
		iconUrl: null,
		createdAt: date,
		updatedAt: date,
		isCollapsed: true,
		tabOrder: 1,
	};
	const { tabOrder: _explicitTabOrder, ...expectedExplicitProject } =
		explicitProject;

	it("adds default project rows without replacing explicit projects", () => {
		expect(
			buildSidebarProjects(
				[explicitProject],
				[
					{
						projectId: "project-explicit",
						projectName: "Ignored",
						projectSlug: "ignored",
						projectGithubRepositoryId: "ignored-repo",
						projectGithubOwner: "ignored-owner",
						projectGithubRepoName: "ignored-name",
						projectIconUrl: null,
						projectCreatedAt: date,
						projectUpdatedAt: date,
					},
					{
						projectId: "project-default",
						projectName: "Default",
						projectSlug: "default",
						projectGithubRepositoryId: "repo-1",
						projectGithubOwner: "owner",
						projectGithubRepoName: "repo",
						projectIconUrl: "https://example.com/icon.png",
						projectCreatedAt: date,
						projectUpdatedAt: date,
					},
				],
			),
		).toEqual([
			expectedExplicitProject,
			{
				id: "project-default",
				name: "Default",
				slug: "default",
				githubRepositoryId: "repo-1",
				githubOwner: "owner",
				githubRepoName: "repo",
				iconUrl: "https://example.com/icon.png",
				createdAt: date,
				updatedAt: date,
				isCollapsed: false,
			},
		]);
	});

	it("sorts explicit projects by tab order and default projects by name after them", () => {
		const laterProject: SidebarProjectRow = {
			...explicitProject,
			id: "project-later",
			name: "Later",
			slug: "later",
			tabOrder: 2,
		};

		expect(
			buildSidebarProjects(
				[laterProject, explicitProject],
				[
					{
						projectId: "project-z",
						projectName: "Zulu",
						projectSlug: "zulu",
						projectGithubRepositoryId: null,
						projectGithubOwner: null,
						projectGithubRepoName: null,
						projectIconUrl: null,
						projectCreatedAt: date,
						projectUpdatedAt: date,
					},
					{
						projectId: "project-a",
						projectName: "Alpha",
						projectSlug: "alpha",
						projectGithubRepositoryId: null,
						projectGithubOwner: null,
						projectGithubRepoName: null,
						projectIconUrl: null,
						projectCreatedAt: date,
						projectUpdatedAt: date,
					},
				],
			).map((project) => project.id),
		).toEqual(["project-explicit", "project-later", "project-a", "project-z"]);
	});
});
