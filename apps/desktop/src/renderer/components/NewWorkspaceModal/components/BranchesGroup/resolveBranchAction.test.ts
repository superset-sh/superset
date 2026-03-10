import { describe, expect, test } from "bun:test";
import { resolveBranchAction } from "./resolveBranchAction";

describe("resolveBranchAction", () => {
	test("opens an existing workspace before any worktree handling", () => {
		const resolved = resolveBranchAction({
			branchName: "feature/existing",
			workspaceByBranch: new Map([["feature/existing", "ws_123"]]),
			trackedWorktreeByBranch: new Map([
				["feature/existing", { worktreeId: "wt_123", existsOnDisk: true }],
			]),
			externalWorktreeByBranch: new Map([
				["feature/existing", { path: "/tmp/feature-existing" }],
			]),
		});

		expect(resolved).toEqual({
			kind: "open-workspace",
			workspaceId: "ws_123",
		});
	});

	test("reopens a tracked worktree when no workspace exists", () => {
		const resolved = resolveBranchAction({
			branchName: "feature/tracked",
			workspaceByBranch: new Map(),
			trackedWorktreeByBranch: new Map([
				["feature/tracked", { worktreeId: "wt_456", existsOnDisk: true }],
			]),
			externalWorktreeByBranch: new Map([
				["feature/tracked", { path: "/tmp/feature-tracked" }],
			]),
		});

		expect(resolved).toEqual({
			kind: "open-worktree",
			worktreeId: "wt_456",
		});
	});

	test("imports an external worktree when it is not tracked yet", () => {
		const resolved = resolveBranchAction({
			branchName: "feature/external",
			workspaceByBranch: new Map(),
			trackedWorktreeByBranch: new Map(),
			externalWorktreeByBranch: new Map([
				["feature/external", { path: "/tmp/feature-external" }],
			]),
		});

		expect(resolved).toEqual({
			kind: "import-worktree",
			worktreePath: "/tmp/feature-external",
		});
	});

	test("falls back to creating a branch workspace", () => {
		const resolved = resolveBranchAction({
			branchName: "feature/new",
			workspaceByBranch: new Map(),
			trackedWorktreeByBranch: new Map(),
			externalWorktreeByBranch: new Map(),
		});

		expect(resolved).toEqual({
			kind: "create-workspace",
		});
	});

	test("ignores tracked worktrees that no longer exist on disk", () => {
		const resolved = resolveBranchAction({
			branchName: "feature/missing",
			workspaceByBranch: new Map(),
			trackedWorktreeByBranch: new Map([
				["feature/missing", { worktreeId: "wt_missing", existsOnDisk: false }],
			]),
			externalWorktreeByBranch: new Map(),
		});

		expect(resolved).toEqual({
			kind: "create-workspace",
		});
	});
});
