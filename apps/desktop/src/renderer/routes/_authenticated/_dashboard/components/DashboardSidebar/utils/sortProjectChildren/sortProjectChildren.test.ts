import { describe, expect, it } from "bun:test";
import type { ActivePaneStatus } from "shared/tabs-types";
import type {
	DashboardSidebarProjectChild,
	DashboardSidebarWorkspace,
} from "../../types";
import { sortProjectChildren } from "./sortProjectChildren";

function makeWorkspace(
	id: string,
	createdAt: string,
	overrides: Partial<DashboardSidebarWorkspace> = {},
): DashboardSidebarWorkspace {
	return {
		id,
		projectId: "project-1",
		hostId: "host-1",
		hostType: "local-device",
		type: "worktree",
		hostIsOnline: null,
		accentColor: null,
		name: id,
		branch: id,
		pullRequest: null,
		repoUrl: null,
		branchExistsOnRemote: false,
		previewUrl: null,
		needsRebase: null,
		behindCount: null,
		createdAt: new Date(createdAt),
		updatedAt: new Date(createdAt),
		taskId: null,
		isPinned: false,
		pendingTransaction: null,
		...overrides,
	};
}

function getWorkspaceIds(children: DashboardSidebarProjectChild[]): string[] {
	return children.flatMap((child) =>
		child.type === "workspace"
			? [child.workspace.id]
			: child.section.workspaces.map((workspace) => workspace.id),
	);
}

const statuses = new Map<string, ActivePaneStatus | null>();

describe("sortProjectChildren", () => {
	it("preserves the exact persisted order in manual mode", () => {
		const children: DashboardSidebarProjectChild[] = [
			{
				type: "workspace",
				workspace: makeWorkspace("second", "2026-02-01"),
			},
			{
				type: "workspace",
				workspace: makeWorkspace("first", "2026-01-01"),
			},
		];

		expect(sortProjectChildren(children, "manual", statuses)).toBe(children);
	});

	it("sorts top-level and grouped workspaces without moving group headers", () => {
		const children: DashboardSidebarProjectChild[] = [
			{
				type: "workspace",
				workspace: makeWorkspace("older-top", "2026-01-01"),
			},
			{
				type: "workspace",
				workspace: makeWorkspace("newer-top", "2026-04-01"),
			},
			{
				type: "section",
				section: {
					id: "section-1",
					projectId: "project-1",
					name: "Grouped",
					createdAt: new Date("2026-01-01"),
					isCollapsed: false,
					tabOrder: 3,
					color: null,
					workspaces: [
						makeWorkspace("older-grouped", "2026-02-01"),
						makeWorkspace("newer-grouped", "2026-03-01"),
					],
				},
			},
		];

		const sorted = sortProjectChildren(children, "created-desc", statuses);

		expect(getWorkspaceIds(sorted)).toEqual([
			"newer-top",
			"older-top",
			"newer-grouped",
			"older-grouped",
		]);
		expect(sorted[2]?.type).toBe("section");
	});

	it("orders urgent and working agents ahead of idle workspaces", () => {
		const children: DashboardSidebarProjectChild[] = [
			{
				type: "workspace",
				workspace: makeWorkspace("idle", "2026-04-01"),
			},
			{
				type: "workspace",
				workspace: makeWorkspace("working", "2026-01-01"),
			},
			{
				type: "workspace",
				workspace: makeWorkspace("permission", "2026-02-01"),
			},
			{
				type: "workspace",
				workspace: makeWorkspace("review", "2026-03-01"),
			},
		];
		const agentStatuses = new Map<string, ActivePaneStatus | null>([
			["working", "working"],
			["permission", "permission"],
			["review", "review"],
		]);

		expect(
			getWorkspaceIds(sortProjectChildren(children, "status", agentStatuses)),
		).toEqual(["permission", "working", "review", "idle"]);
	});

	it("keeps the local main workspace pinned for every automatic sort", () => {
		const children: DashboardSidebarProjectChild[] = [
			{
				type: "workspace",
				workspace: makeWorkspace("new-worktree", "2026-04-01"),
			},
			{
				type: "workspace",
				workspace: makeWorkspace("local-main", "2026-01-01", {
					type: "main",
				}),
			},
		];

		for (const sortOrder of [
			"status",
			"created-desc",
			"created-asc",
			"name",
		] as const) {
			expect(
				getWorkspaceIds(sortProjectChildren(children, sortOrder, statuses))[0],
			).toBe("local-main");
		}
	});

	it("supports oldest-first and natural name ordering", () => {
		const children: DashboardSidebarProjectChild[] = [
			{
				type: "workspace",
				workspace: makeWorkspace("Agent 10", "2026-03-01"),
			},
			{
				type: "workspace",
				workspace: makeWorkspace("Agent 2", "2026-02-01"),
			},
			{
				type: "workspace",
				workspace: makeWorkspace("Agent 1", "2026-01-01"),
			},
		];

		expect(
			getWorkspaceIds(sortProjectChildren(children, "created-asc", statuses)),
		).toEqual(["Agent 1", "Agent 2", "Agent 10"]);
		expect(
			getWorkspaceIds(sortProjectChildren(children, "name", statuses)),
		).toEqual(["Agent 1", "Agent 2", "Agent 10"]);
	});
});
