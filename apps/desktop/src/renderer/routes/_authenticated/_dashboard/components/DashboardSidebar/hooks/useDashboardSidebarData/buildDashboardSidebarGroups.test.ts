import { describe, expect, test } from "bun:test";
import type { DashboardSidebarWorkspacePullRequest } from "../../types";
import {
	buildDashboardSidebarGroups,
	type SidebarGroupProjectInput,
	type SidebarGroupSectionInput,
	type SidebarGroupWorkspaceInput,
} from "./buildDashboardSidebarGroups";

const NOW = new Date("2026-06-04T00:00:00.000Z");

function makeProject(
	overrides: Partial<SidebarGroupProjectInput> = {},
): SidebarGroupProjectInput {
	return {
		id: "project-1",
		name: "Project One",
		slug: "project-one",
		githubRepositoryId: null,
		githubOwner: null,
		githubRepoName: null,
		iconUrl: null,
		createdAt: NOW,
		updatedAt: NOW,
		isCollapsed: false,
		...overrides,
	};
}

function makeSection(
	overrides: Partial<SidebarGroupSectionInput> = {},
): SidebarGroupSectionInput {
	return {
		id: "section-1",
		projectId: "project-1",
		name: "Section One",
		createdAt: NOW,
		isCollapsed: false,
		tabOrder: 1,
		color: "#abcdef",
		...overrides,
	};
}

function makeWorkspace(
	overrides: Partial<SidebarGroupWorkspaceInput> = {},
): SidebarGroupWorkspaceInput {
	return {
		id: "workspace-1",
		projectId: "project-1",
		hostId: "machine-1",
		type: "worktree",
		name: "Workspace One",
		branch: "feature/one",
		taskId: null,
		createdAt: NOW,
		updatedAt: NOW,
		hostIsOnline: true,
		tabOrder: 10,
		sectionId: null,
		pendingTransaction: null,
		...overrides,
	};
}

const NO_PULL_REQUESTS = new Map<
	string,
	DashboardSidebarWorkspacePullRequest | null
>();

function collectWorkspaceIds(
	groups: ReturnType<typeof buildDashboardSidebarGroups>,
): string[] {
	const ids: string[] = [];
	for (const project of groups) {
		for (const child of project.children) {
			if (child.type === "workspace") {
				ids.push(child.workspace.id);
			} else {
				for (const workspace of child.section.workspaces) {
					ids.push(workspace.id);
				}
			}
		}
	}
	return ids;
}

describe("buildDashboardSidebarGroups", () => {
	test("places a workspace into its resolved section", () => {
		const groups = buildDashboardSidebarGroups({
			sidebarProjects: [makeProject()],
			sidebarSections: [makeSection()],
			visibleSidebarWorkspaces: [
				makeWorkspace({ id: "workspace-1", sectionId: "section-1" }),
			],
			machineId: "machine-1",
			pullRequestsByWorkspaceId: NO_PULL_REQUESTS,
		});

		expect(groups).toHaveLength(1);
		const sectionChild = groups[0]?.children.find(
			(child) => child.type === "section",
		);
		expect(sectionChild?.type).toBe("section");
		if (sectionChild?.type === "section") {
			expect(sectionChild.section.workspaces.map((w) => w.id)).toEqual([
				"workspace-1",
			]);
		}
	});

	// Reproduces https://github.com/superset-sh/superset/issues/5106:
	// a workspace whose sidebar state still references a section that no longer
	// exists (e.g. the section was deleted on another device and that delete
	// synced before the workspace's own state update) must not vanish from the
	// sidebar. It still lives in the workspaces collection — hence it stayed
	// visible in the Workspaces pane — but it was silently dropped here.
	test("keeps a workspace whose section no longer exists", () => {
		const groups = buildDashboardSidebarGroups({
			sidebarProjects: [makeProject()],
			// The section the workspace points at is gone.
			sidebarSections: [],
			visibleSidebarWorkspaces: [
				makeWorkspace({
					id: "orphaned-workspace",
					sectionId: "deleted-section",
				}),
			],
			machineId: "machine-1",
			pullRequestsByWorkspaceId: NO_PULL_REQUESTS,
		});

		expect(collectWorkspaceIds(groups)).toContain("orphaned-workspace");
	});

	test("renders an orphaned-section workspace as a top-level child", () => {
		const groups = buildDashboardSidebarGroups({
			sidebarProjects: [makeProject()],
			sidebarSections: [],
			visibleSidebarWorkspaces: [
				makeWorkspace({
					id: "orphaned-workspace",
					sectionId: "deleted-section",
				}),
			],
			machineId: "machine-1",
			pullRequestsByWorkspaceId: NO_PULL_REQUESTS,
		});

		const child = groups[0]?.children[0];
		expect(child?.type).toBe("workspace");
		if (child?.type === "workspace") {
			expect(child.workspace.id).toBe("orphaned-workspace");
		}
	});

	test("drops workspaces whose project is missing (unchanged behaviour)", () => {
		const groups = buildDashboardSidebarGroups({
			sidebarProjects: [makeProject({ id: "project-1" })],
			sidebarSections: [],
			visibleSidebarWorkspaces: [
				makeWorkspace({ id: "workspace-1", projectId: "project-missing" }),
			],
			machineId: "machine-1",
			pullRequestsByWorkspaceId: NO_PULL_REQUESTS,
		});

		expect(collectWorkspaceIds(groups)).toEqual([]);
	});
});
