import { describe, expect, test } from "bun:test";
import type { ExternalWorktree } from "./git";
import { reconcileTrackedWorktrees } from "./reconcile-tracked-worktrees";
import { selectExternalWorktreesForImport } from "./select-external-worktrees-for-import";

function wt(overrides: Partial<ExternalWorktree>): ExternalWorktree {
	return {
		path: "/tmp/wt",
		branch: "feature",
		isBare: false,
		isDetached: false,
		...overrides,
	};
}

describe("reconcileTrackedWorktrees", () => {
	const neverActive = () => false;

	test("keeps tracked rows whose path and branch match the live worktree", () => {
		const live = [wt({ path: "/repos/wt-a", branch: "feature-a" })];
		const tracked = [{ id: "row-a", path: "/repos/wt-a", branch: "feature-a" }];

		const result = reconcileTrackedWorktrees({
			trackedWorktrees: tracked,
			liveWorktrees: live,
			hasActiveWorkspace: neverActive,
		});

		expect(result.staleIds).toEqual([]);
		expect([...result.validPaths]).toEqual(["/repos/wt-a"]);
	});

	test("flags tracked rows as stale when path no longer exists in git worktree list", () => {
		const live: ExternalWorktree[] = [];
		const tracked = [
			{ id: "row-gone", path: "/repos/wt-gone", branch: "feature-x" },
		];

		const result = reconcileTrackedWorktrees({
			trackedWorktrees: tracked,
			liveWorktrees: live,
			hasActiveWorkspace: neverActive,
		});

		expect(result.staleIds).toEqual(["row-gone"]);
		expect(result.validPaths.size).toBe(0);
	});

	test("flags tracked rows as stale when live branch differs (recreated at same path)", () => {
		// The reported scenario from #4608: a worktree was imported, then
		// deleted+recreated externally with a different branch at the same path.
		const live = [wt({ path: "/repos/wt-a", branch: "new-branch" })];
		const tracked = [
			{ id: "row-a", path: "/repos/wt-a", branch: "old-branch" },
		];

		const result = reconcileTrackedWorktrees({
			trackedWorktrees: tracked,
			liveWorktrees: live,
			hasActiveWorkspace: neverActive,
		});

		expect(result.staleIds).toEqual(["row-a"]);
		expect(result.validPaths.size).toBe(0);
	});

	test("never prunes a stale row that still has an active workspace", () => {
		const live: ExternalWorktree[] = [];
		const tracked = [
			{ id: "row-active", path: "/repos/wt-active", branch: "feature" },
		];

		const result = reconcileTrackedWorktrees({
			trackedWorktrees: tracked,
			liveWorktrees: live,
			hasActiveWorkspace: (id) => id === "row-active",
		});

		expect(result.staleIds).toEqual([]);
		expect([...result.validPaths]).toEqual(["/repos/wt-active"]);
	});

	test("pruned paths allow the recreated worktree through selectExternalWorktreesForImport", () => {
		// End-to-end check of the fix: combine reconcile + select so that the
		// recreated worktree is no longer silently dropped.
		const mainRepoPath = "/repos/main";
		const live = [
			wt({ path: mainRepoPath, branch: "main" }),
			wt({ path: "/repos/wt-a", branch: "new-branch" }),
		];
		const tracked = [
			{ id: "row-a", path: "/repos/wt-a", branch: "old-branch" },
		];

		const { staleIds, validPaths } = reconcileTrackedWorktrees({
			trackedWorktrees: tracked,
			liveWorktrees: live,
			hasActiveWorkspace: neverActive,
		});

		expect(staleIds).toEqual(["row-a"]);

		const importable = selectExternalWorktreesForImport(live, {
			mainRepoPath,
			trackedPaths: validPaths,
		});
		expect(importable.map((w) => w.path)).toEqual(["/repos/wt-a"]);
		expect(importable[0]?.branch).toBe("new-branch");
	});

	test("without reconcile, the same scenario silently drops the recreated worktree", () => {
		// Locks in the original bug: passing raw trackedPaths (the previous
		// behavior) filters out the recreated worktree.
		const mainRepoPath = "/repos/main";
		const live = [
			wt({ path: mainRepoPath, branch: "main" }),
			wt({ path: "/repos/wt-a", branch: "new-branch" }),
		];
		const trackedPaths = new Set(["/repos/wt-a"]);

		const importable = selectExternalWorktreesForImport(live, {
			mainRepoPath,
			trackedPaths,
		});
		expect(importable).toEqual([]);
	});
});
