import { describe, expect, it, test } from "bun:test";
import {
	getVisibleSidebarWorkspaces,
	isAutoIncludedLocalMainWorkspace,
} from "./sidebarVisibility";

/**
 * Reproduction for issue #5347:
 * "Automations that create a new workspace don't materialize the workspace in
 * the sidebar on run."
 *
 * An automation runs in the cloud, relays `workspaces.create` to the host, and
 * the new workspace is created with `type: "worktree"` on the host machine. It
 * syncs into the desktop's local `v2Workspaces` collection via Electric, but
 * (like a CLI-created workspace) it has NO `v2WorkspaceLocalState` row — nothing
 * in the renderer placed it in the sidebar.
 *
 * The sidebar's *direct* visibility computation in `useDashboardSidebarData`
 * surfaces row-less local workspaces only through the "auto-included main"
 * path: `rawLocalMainWorkspaces` queries `v2Workspaces WHERE type = 'main'` and
 * then filters with `isAutoIncludedLocalMainWorkspace`. A `worktree` produced by
 * an automation never enters that query, so it is invisible until something
 * writes a local-state row for it — which only happens when the user navigates
 * into the workspace (`ensureWorkspaceInSidebar` in the v2-workspace layout).
 *
 * The tests below model that exact computation against the real visibility
 * helpers and show the asymmetry: a `main` workspace with no local-state row is
 * surfaced, an automation `worktree` with no local-state row is not.
 */

type LocalWorkspace = {
	id: string;
	hostId: string;
	projectId: string;
	type: "main" | "worktree";
	isHidden?: boolean | null;
};

const MACHINE_ID = "this-machine";
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

/**
 * Mirrors `useDashboardSidebarData.visibleSidebarWorkspaces`: auto-include local
 * workspaces that have no local-state row, but only from the `type === "main"`
 * query, then append the explicitly placed (local-state-backed) workspaces.
 */
function computeVisibleSidebarWorkspaces(args: {
	localWorkspaces: LocalWorkspace[];
	localStateWorkspaceIds: ReadonlySet<string>;
	sidebarProjectIds: ReadonlySet<string>;
	machineId: string;
	// Workspaces with a (visible) local-state row, i.e. the local-state join.
	sidebarWorkspaces: LocalWorkspace[];
}): LocalWorkspace[] {
	// `rawLocalMainWorkspaces` only ever sees `type === "main"` rows.
	const localMainWorkspaces = args.localWorkspaces.filter(
		(workspace) => workspace.type === "main",
	);

	const autoLocalMainWorkspaces = localMainWorkspaces.filter((workspace) =>
		isAutoIncludedLocalMainWorkspace(workspace, {
			localStateWorkspaceIds: args.localStateWorkspaceIds,
			sidebarProjectIds: args.sidebarProjectIds,
			machineId: args.machineId,
		}),
	);

	return getVisibleSidebarWorkspaces([
		...autoLocalMainWorkspaces,
		...args.sidebarWorkspaces,
	]);
}

describe("sidebar visibility for externally-created workspaces (#5347)", () => {
	const sidebarProjectIds = new Set([PROJECT_ID]);

	it("auto-includes a row-less local `main` workspace (control)", () => {
		const mainWorkspace: LocalWorkspace = {
			id: "main-ws",
			hostId: MACHINE_ID,
			projectId: PROJECT_ID,
			type: "main",
		};

		const visible = computeVisibleSidebarWorkspaces({
			localWorkspaces: [mainWorkspace],
			localStateWorkspaceIds: new Set(),
			sidebarProjectIds,
			machineId: MACHINE_ID,
			sidebarWorkspaces: [],
		});

		expect(visible.map((workspace) => workspace.id)).toContain("main-ws");
	});

	/**
	 * Currently FAILS — the automation worktree is missing from the sidebar's
	 * direct visibility computation, reproducing the reported bug. Marked
	 * `test.failing` so it is green while the bug exists and flags loudly once a
	 * fix surfaces automation worktrees (at which point drop `.failing`).
	 */
	test.failing("auto-includes a row-less local automation `worktree` workspace", () => {
		const automationWorkspace: LocalWorkspace = {
			id: "automation-ws",
			hostId: MACHINE_ID,
			projectId: PROJECT_ID,
			type: "worktree",
		};

		const visible = computeVisibleSidebarWorkspaces({
			localWorkspaces: [automationWorkspace],
			localStateWorkspaceIds: new Set(),
			sidebarProjectIds,
			machineId: MACHINE_ID,
			sidebarWorkspaces: [],
		});

		// Expected: the automation's workspace shows up in the sidebar on run.
		// Actual: it is absent until the user opens it and a local-state row is
		// written, so this assertion does not hold today.
		expect(visible.map((workspace) => workspace.id)).toContain("automation-ws");
	});

	it("characterizes today's behavior: the worktree is absent, the main is present", () => {
		const mainWorkspace: LocalWorkspace = {
			id: "main-ws",
			hostId: MACHINE_ID,
			projectId: PROJECT_ID,
			type: "main",
		};
		const automationWorkspace: LocalWorkspace = {
			id: "automation-ws",
			hostId: MACHINE_ID,
			projectId: PROJECT_ID,
			type: "worktree",
		};

		const visible = computeVisibleSidebarWorkspaces({
			localWorkspaces: [mainWorkspace, automationWorkspace],
			localStateWorkspaceIds: new Set(),
			sidebarProjectIds,
			machineId: MACHINE_ID,
			sidebarWorkspaces: [],
		});

		const visibleIds = visible.map((workspace) => workspace.id);
		expect(visibleIds).toContain("main-ws");
		// The bug: the automation-created worktree never makes it into the sidebar.
		expect(visibleIds).not.toContain("automation-ws");
	});
});
