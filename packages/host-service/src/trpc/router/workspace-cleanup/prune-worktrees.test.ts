import { describe, expect, test } from "bun:test";
import {
	findOrphanedWorktreePaths,
	planWorktreePrune,
	type WorktreeCandidate,
} from "./prune-worktrees";

// Reasonable, safe-to-prune-nothing baseline. Each test overrides only the
// fields relevant to the case it exercises, so the intent stays visible.
function candidate(
	overrides: Partial<WorktreeCandidate> & { path: string },
): WorktreeCandidate {
	return {
		registered: true,
		branch: "feature/x",
		detached: false,
		bare: false,
		locked: false,
		commitsAheadOfBase: 3,
		hasUncommittedChanges: false,
		hasWorkspace: true,
		isMainWorkspace: false,
		...overrides,
	};
}

describe("planWorktreePrune", () => {
	// ── Reproduction of issue #5631 ──
	// A realistic mix modeled on the report: 55 orphaned folders + a batch of
	// stale local-only branches (0 ahead, clean) alongside worktrees that must
	// be protected. The whole point of the feature is that both categories are
	// identified as prunable while the protected ones are spared.
	test("reproduces #5631: identifies orphaned and stale local-only worktrees", () => {
		const candidates: WorktreeCandidate[] = [
			// Orphaned: on disk, git forgot it, no workspace row.
			candidate({
				path: "/wt/orphan-a",
				registered: false,
				hasWorkspace: false,
			}),
			candidate({
				path: "/wt/orphan-b",
				registered: false,
				hasWorkspace: false,
			}),
			// Stale local-only: git tracks it, 0 ahead of base, clean, no workspace.
			candidate({
				path: "/wt/stale",
				registered: true,
				commitsAheadOfBase: 0,
				hasUncommittedChanges: false,
				hasWorkspace: false,
			}),
			// Active workspace with real work — must survive.
			candidate({
				path: "/wt/active",
				commitsAheadOfBase: 5,
				hasWorkspace: true,
			}),
		];

		const plan = planWorktreePrune(candidates);

		expect(plan.prune).toEqual([
			{ path: "/wt/orphan-a", reason: "orphaned" },
			{ path: "/wt/orphan-b", reason: "orphaned" },
			{ path: "/wt/stale", reason: "stale-local-only" },
		]);
		expect(plan.keep.map((k) => k.path)).toEqual(["/wt/active"]);
	});

	test("prunes an orphaned worktree", () => {
		const plan = planWorktreePrune([
			candidate({ path: "/wt/o", registered: false, hasWorkspace: false }),
		]);
		expect(plan.prune).toEqual([{ path: "/wt/o", reason: "orphaned" }]);
	});

	test("prunes a stale local-only worktree", () => {
		const plan = planWorktreePrune([
			candidate({
				path: "/wt/s",
				registered: true,
				commitsAheadOfBase: 0,
				hasWorkspace: false,
			}),
		]);
		expect(plan.prune).toEqual([{ path: "/wt/s", reason: "stale-local-only" }]);
	});

	// ── Safety guards: must never destroy recoverable state ──

	test("never prunes a worktree that backs a live workspace", () => {
		const plan = planWorktreePrune([
			// Looks orphaned, but still has a workspace row: keep it.
			candidate({ path: "/wt/w", registered: false, hasWorkspace: true }),
		]);
		expect(plan.prune).toEqual([]);
		expect(plan.keep).toEqual([
			{ path: "/wt/w", reason: "backs a live workspace" },
		]);
	});

	test("never prunes the main workspace", () => {
		const plan = planWorktreePrune([
			candidate({
				path: "/repo",
				registered: true,
				commitsAheadOfBase: 0,
				hasWorkspace: false,
				isMainWorkspace: true,
			}),
		]);
		expect(plan.prune).toEqual([]);
	});

	test("never prunes a worktree with uncommitted changes", () => {
		const plan = planWorktreePrune([
			candidate({
				path: "/wt/dirty",
				registered: true,
				commitsAheadOfBase: 0,
				hasUncommittedChanges: true,
				hasWorkspace: false,
			}),
		]);
		expect(plan.prune).toEqual([]);
		expect(plan.keep[0]?.reason).toBe("has uncommitted changes");
	});

	test("never prunes a locked worktree even when otherwise stale", () => {
		const plan = planWorktreePrune([
			candidate({
				path: "/wt/locked",
				registered: true,
				commitsAheadOfBase: 0,
				locked: true,
				hasWorkspace: false,
			}),
		]);
		expect(plan.prune).toEqual([]);
		expect(plan.keep[0]?.reason).toBe("locked");
	});

	test("never prunes a branch that is ahead of base", () => {
		const plan = planWorktreePrune([
			candidate({
				path: "/wt/ahead",
				registered: true,
				commitsAheadOfBase: 2,
				hasWorkspace: false,
			}),
		]);
		expect(plan.prune).toEqual([]);
		expect(plan.keep[0]?.reason).toBe("2 commit(s) ahead of base");
	});

	test("never prunes when the ahead-count is unknown", () => {
		const plan = planWorktreePrune([
			candidate({
				path: "/wt/unknown",
				registered: true,
				commitsAheadOfBase: null,
				hasWorkspace: false,
			}),
		]);
		expect(plan.prune).toEqual([]);
		expect(plan.keep[0]?.reason).toBe("could not determine commit status");
	});

	test("never prunes a detached-HEAD worktree", () => {
		const plan = planWorktreePrune([
			candidate({
				path: "/wt/detached",
				registered: true,
				detached: true,
				branch: null,
				commitsAheadOfBase: 0,
				hasWorkspace: false,
			}),
		]);
		expect(plan.prune).toEqual([]);
		expect(plan.keep[0]?.reason).toBe("detached HEAD");
	});
});

describe("findOrphanedWorktreePaths", () => {
	test("returns disk paths git no longer tracks", () => {
		const orphans = findOrphanedWorktreePaths(
			["/wt/a", "/wt/b", "/wt/c"],
			["/wt/b"],
		);
		expect(orphans).toEqual(["/wt/a", "/wt/c"]);
	});

	test("returns empty when every disk path is registered", () => {
		expect(findOrphanedWorktreePaths(["/wt/a"], ["/wt/a", "/wt/b"])).toEqual(
			[],
		);
	});
});
