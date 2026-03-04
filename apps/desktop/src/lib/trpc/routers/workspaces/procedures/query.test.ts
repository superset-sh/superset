import { describe, expect, test } from "bun:test";

/**
 * Shape of items returned by the `getAllGrouped` tRPC query.
 * Mirrors the structure assembled in query.ts.
 */
type ProjectGroup = {
	project: {
		id: string;
		name: string;
		color: string;
		tabOrder: number;
		githubOwner: string | null;
		mainRepoPath: string;
		hideImage: boolean;
		iconUrl: string | null;
	};
	workspaces: Array<{
		id: string;
		projectId: string;
		worktreePath: string;
		type: "worktree" | "branch";
		branch: string;
		name: string;
		tabOrder: number;
		createdAt: number;
		updatedAt: number;
		lastOpenedAt: number;
		isUnread: boolean;
		isUnnamed: boolean;
		worktreeId: string | null;
	}>;
};

/**
 * This is the sort currently used by `getAllGrouped` (query.ts line 185-187).
 * It sorts project groups by their manual tab order, NOT by latest activity.
 */
function sortByTabOrder(groups: ProjectGroup[]): ProjectGroup[] {
	return [...groups].sort((a, b) => a.project.tabOrder - b.project.tabOrder);
}

describe("getAllGrouped — project sort order (issue #1746)", () => {
	/**
	 * Regression test for https://github.com/nicholasgasior/superset/issues/1746
	 *
	 * Expected: the most recently active project (highest workspace lastOpenedAt)
	 * should appear first in the sidebar.
	 *
	 * Actual (current): projects are ordered by tabOrder, so a project that was
	 * added earlier (lower tabOrder) always stays at the top even when a newer
	 * project has more recent activity.
	 */
	test("returns most recently active project first regardless of tabOrder", () => {
		// Project A was pinned first (tabOrder=0) but hasn't been touched recently
		const projectA: ProjectGroup = {
			project: {
				id: "project-a",
				name: "Project A",
				color: "#ff0000",
				tabOrder: 0,
				githubOwner: null,
				mainRepoPath: "/repos/a",
				hideImage: false,
				iconUrl: null,
			},
			workspaces: [
				{
					id: "ws-a1",
					projectId: "project-a",
					worktreePath: "/repos/a",
					type: "branch",
					branch: "main",
					name: "main",
					tabOrder: 0,
					createdAt: 1_000,
					updatedAt: 1_000,
					lastOpenedAt: 1_000, // older — last opened at t=1000
					isUnread: false,
					isUnnamed: false,
					worktreeId: null,
				},
			],
		};

		// Project B was pinned second (tabOrder=1) but has very recent activity
		const projectB: ProjectGroup = {
			project: {
				id: "project-b",
				name: "Project B",
				color: "#00ff00",
				tabOrder: 1,
				githubOwner: null,
				mainRepoPath: "/repos/b",
				hideImage: false,
				iconUrl: null,
			},
			workspaces: [
				{
					id: "ws-b1",
					projectId: "project-b",
					worktreePath: "/repos/b",
					type: "branch",
					branch: "main",
					name: "main",
					tabOrder: 0,
					createdAt: 2_000,
					updatedAt: 2_000,
					lastOpenedAt: 2_000, // more recent — last opened at t=2000
					isUnread: false,
					isUnnamed: false,
					worktreeId: null,
				},
			],
		};

		const groups: ProjectGroup[] = [projectA, projectB];

		// Current getAllGrouped sort: by tabOrder.
		// This keeps Project A (tabOrder=0) before Project B (tabOrder=1) even
		// though Project B was used more recently.
		const sorted = sortByTabOrder(groups);

		// The feature requests that the most recently active project comes first.
		// Project B has lastOpenedAt=2000 which is more recent than A's 1000,
		// so B should be first — but the current tabOrder sort puts A first.
		expect(sorted[0].project.id).toBe("project-b"); // fails: currently "project-a"
		expect(sorted[1].project.id).toBe("project-a");
	});

	test("projects with no workspaces are placed last when sorting by activity", () => {
		const emptyProject: ProjectGroup = {
			project: {
				id: "project-empty",
				name: "Empty Project",
				color: "#aaaaaa",
				tabOrder: 0,
				githubOwner: null,
				mainRepoPath: "/repos/empty",
				hideImage: false,
				iconUrl: null,
			},
			workspaces: [],
		};

		const activeProject: ProjectGroup = {
			project: {
				id: "project-active",
				name: "Active Project",
				color: "#0000ff",
				tabOrder: 1,
				githubOwner: null,
				mainRepoPath: "/repos/active",
				hideImage: false,
				iconUrl: null,
			},
			workspaces: [
				{
					id: "ws-active",
					projectId: "project-active",
					worktreePath: "/repos/active",
					type: "branch",
					branch: "main",
					name: "main",
					tabOrder: 0,
					createdAt: 5_000,
					updatedAt: 5_000,
					lastOpenedAt: 5_000,
					isUnread: false,
					isUnnamed: false,
					worktreeId: null,
				},
			],
		};

		const groups: ProjectGroup[] = [emptyProject, activeProject];
		const sorted = sortByTabOrder(groups);

		// Active project (with workspaces) should come before the empty one.
		// Current tabOrder sort places emptyProject (tabOrder=0) first.
		expect(sorted[0].project.id).toBe("project-active"); // fails: currently "project-empty"
		expect(sorted[1].project.id).toBe("project-empty");
	});
});
