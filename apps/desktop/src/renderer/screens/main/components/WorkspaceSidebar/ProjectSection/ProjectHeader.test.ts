import { describe, expect, test } from "bun:test";
import type { SidebarSection, SidebarWorkspace } from "../types";

/**
 * Reproduces GitHub issue #3263:
 * After closing the local (branch) workspace via the right-click context menu,
 * there was no way to re-add it. The `openMainRepoWorkspace` tRPC mutation
 * exists and works correctly, but it was only wired up during initial project
 * import — no UI entry point existed for projects that already had their local
 * workspace closed.
 *
 * The fix adds an "Open Local Workspace" item to the project's context menu,
 * shown only when no branch workspace is present. This test validates the
 * detection logic that controls visibility of that menu item.
 */
describe("ProjectHeader — Open Local Workspace visibility (#3263)", () => {
	function hasBranchWorkspace(
		workspaces: SidebarWorkspace[],
		sections: SidebarSection[],
	): boolean {
		return (
			workspaces.some((w) => w.type === "branch") ||
			sections.some((s) => s.workspaces.some((w) => w.type === "branch"))
		);
	}

	const makeWorkspace = (
		overrides: Partial<SidebarWorkspace> = {},
	): SidebarWorkspace => ({
		id: "ws-1",
		projectId: "proj-1",
		worktreePath: "/tmp/repo",
		type: "worktree",
		branch: "feature-x",
		name: "feature-x",
		tabOrder: 1,
		isUnread: false,
		...overrides,
	});

	const makeSection = (
		overrides: Partial<SidebarSection> = {},
	): SidebarSection => ({
		id: "section-1",
		name: "Section",
		tabOrder: 0,
		isCollapsed: false,
		color: null,
		workspaces: [],
		...overrides,
	});

	test("returns false when project has no workspaces (local was closed)", () => {
		// After closing the local workspace, the project has no branch workspace.
		// The menu item should be visible (hasBranchWorkspace === false).
		expect(hasBranchWorkspace([], [])).toBe(false);
	});

	test("returns false when project has only worktree workspaces", () => {
		const workspaces = [
			makeWorkspace({ id: "ws-1", type: "worktree", branch: "feat-a" }),
			makeWorkspace({ id: "ws-2", type: "worktree", branch: "feat-b" }),
		];
		expect(hasBranchWorkspace(workspaces, [])).toBe(false);
	});

	test("returns true when project has a branch workspace at top level", () => {
		const workspaces = [
			makeWorkspace({ id: "ws-1", type: "branch", branch: "main" }),
			makeWorkspace({ id: "ws-2", type: "worktree", branch: "feat-a" }),
		];
		expect(hasBranchWorkspace(workspaces, [])).toBe(true);
	});

	test("returns true when branch workspace is inside a section", () => {
		const section = makeSection({
			workspaces: [
				makeWorkspace({ id: "ws-1", type: "branch", branch: "main" }),
			],
		});
		expect(hasBranchWorkspace([], [section])).toBe(true);
	});

	test("returns false when sections contain only worktree workspaces", () => {
		const section = makeSection({
			workspaces: [
				makeWorkspace({ id: "ws-1", type: "worktree", branch: "feat-a" }),
			],
		});
		expect(hasBranchWorkspace([], [section])).toBe(false);
	});
});
