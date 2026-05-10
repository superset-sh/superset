import { describe, expect, it } from "bun:test";
import {
	type AutoIncludeWorkspaceCandidate,
	MAIN_WORKSPACE_TAB_ORDER,
	selectAutoIncludedLocalWorkspaces,
} from "./useDashboardSidebarData.utils";

const MACHINE_ID = "machine-1";
const PROJECT_ID = "project-1";
const REMOTE_MACHINE_ID = "machine-2";

function createCandidate(
	overrides: Partial<AutoIncludeWorkspaceCandidate> = {},
): AutoIncludeWorkspaceCandidate {
	return {
		id: "workspace-1",
		projectId: PROJECT_ID,
		hostId: MACHINE_ID,
		type: "main",
		hostIsOnline: true,
		name: "main",
		branch: "main",
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		updatedAt: new Date("2026-01-01T00:00:00.000Z"),
		...overrides,
	};
}

describe("selectAutoIncludedLocalWorkspaces", () => {
	it("auto-includes a local main workspace whose project is in the sidebar", () => {
		const main = createCandidate({ id: "main-1", type: "main" });

		const result = selectAutoIncludedLocalWorkspaces({
			candidates: [main],
			workspacesWithLocalStateIds: new Set(),
			sidebarProjectIds: new Set([PROJECT_ID]),
			machineId: MACHINE_ID,
		});

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			id: "main-1",
			tabOrder: MAIN_WORKSPACE_TAB_ORDER,
			sectionId: null,
		});
	});

	// Reproduces issue #4171: after upgrading to v1.8.4, worktree workspaces that
	// already exist in v2_workspaces (cloud) but lack a v2_workspace_local_state
	// row (per-device localStorage) are filtered out of the sidebar's inner-join
	// and become invisible. The auto-include path must surface them so users
	// don't lose access to their workspaces on a fresh device or after a cache
	// reset. Pre-fix this test failed because the upstream query filtered to
	// `type === "main"`, dropping worktrees before they could be auto-included.
	it("auto-includes a local worktree workspace whose project is in the sidebar (issue #4171)", () => {
		const worktree = createCandidate({
			id: "worktree-1",
			type: "worktree",
			name: "feature/x",
			branch: "feature/x",
		});

		const result = selectAutoIncludedLocalWorkspaces({
			candidates: [worktree],
			workspacesWithLocalStateIds: new Set(),
			sidebarProjectIds: new Set([PROJECT_ID]),
			machineId: MACHINE_ID,
		});

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			id: "worktree-1",
			type: "worktree",
			sectionId: null,
		});
		// Worktrees fall back to creation time so they sort after the main
		// workspace (which pins to MIN_SAFE_INTEGER) without colliding with
		// explicitly-positioned siblings whose tab orders are small positive
		// integers.
		expect(result[0]?.tabOrder).toBe(worktree.createdAt.getTime());
		expect(result[0]?.tabOrder).toBeGreaterThan(MAIN_WORKSPACE_TAB_ORDER);
	});

	it("skips workspaces that already have a local state row", () => {
		const ws = createCandidate({ id: "ws-1" });

		const result = selectAutoIncludedLocalWorkspaces({
			candidates: [ws],
			workspacesWithLocalStateIds: new Set(["ws-1"]),
			sidebarProjectIds: new Set([PROJECT_ID]),
			machineId: MACHINE_ID,
		});

		expect(result).toEqual([]);
	});

	it("skips workspaces hosted on a remote device", () => {
		const remote = createCandidate({
			id: "remote-1",
			hostId: REMOTE_MACHINE_ID,
		});

		const result = selectAutoIncludedLocalWorkspaces({
			candidates: [remote],
			workspacesWithLocalStateIds: new Set(),
			sidebarProjectIds: new Set([PROJECT_ID]),
			machineId: MACHINE_ID,
		});

		expect(result).toEqual([]);
	});

	it("skips workspaces whose project is not in the sidebar", () => {
		const ws = createCandidate({ id: "ws-1", projectId: "other-project" });

		const result = selectAutoIncludedLocalWorkspaces({
			candidates: [ws],
			workspacesWithLocalStateIds: new Set(),
			sidebarProjectIds: new Set([PROJECT_ID]),
			machineId: MACHINE_ID,
		});

		expect(result).toEqual([]);
	});

	it("auto-includes both a main and a worktree on the same project", () => {
		const main = createCandidate({ id: "main-1", type: "main" });
		const worktree = createCandidate({
			id: "worktree-1",
			type: "worktree",
			createdAt: new Date("2026-02-01T00:00:00.000Z"),
		});

		const result = selectAutoIncludedLocalWorkspaces({
			candidates: [main, worktree],
			workspacesWithLocalStateIds: new Set(),
			sidebarProjectIds: new Set([PROJECT_ID]),
			machineId: MACHINE_ID,
		});

		expect(result).toHaveLength(2);
		const byId = new Map(result.map((w) => [w.id, w]));
		expect(byId.get("main-1")?.tabOrder).toBe(MAIN_WORKSPACE_TAB_ORDER);
		expect(byId.get("worktree-1")?.tabOrder).toBe(worktree.createdAt.getTime());
	});
});
