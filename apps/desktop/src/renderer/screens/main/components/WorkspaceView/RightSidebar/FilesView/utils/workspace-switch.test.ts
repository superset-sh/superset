import { describe, expect, test } from "bun:test";
import { createWorktreePathTracker } from "./workspace-switch";

describe("createWorktreePathTracker", () => {
	test("returns false on initial defined path (first mount)", () => {
		const tracker = createWorktreePathTracker();
		expect(tracker.update("/path/to/workspace-a")).toBe(false);
	});

	test("returns true when switching from one path to another", () => {
		const tracker = createWorktreePathTracker();
		tracker.update("/path/to/workspace-a");
		expect(tracker.update("/path/to/workspace-b")).toBe(true);
	});

	test("returns false when path is unchanged", () => {
		const tracker = createWorktreePathTracker();
		tracker.update("/path/to/workspace-a");
		expect(tracker.update("/path/to/workspace-a")).toBe(false);
	});

	test("returns false for undefined worktreePath", () => {
		const tracker = createWorktreePathTracker();
		tracker.update("/path/to/workspace-a");
		expect(tracker.update(undefined)).toBe(false);
	});

	/**
	 * This is the core reproduction for issue #2726:
	 *
	 * When a user switches workspaces, the workspace query briefly returns
	 * undefined while loading the new workspace data. The old code updated
	 * `prevWorktreePathRef` to `undefined` during this transient state,
	 * which caused the subsequent real path change to fail the
	 * `prev !== undefined` guard — skipping tree invalidation entirely.
	 *
	 * Sequence:
	 *   1. worktreePath = "/path/A"  (workspace A loaded)
	 *   2. worktreePath = undefined   (workspace B query loading)
	 *   3. worktreePath = "/path/B"  (workspace B loaded)
	 *
	 * Expected: step 3 should trigger invalidation (return true).
	 * Bug:      step 3 returned false because step 2 cleared the previous path.
	 */
	test("invalidates after transient undefined during workspace switch (issue #2726)", () => {
		const tracker = createWorktreePathTracker();

		// Step 1: Workspace A is loaded
		tracker.update("/path/to/workspace-a");

		// Step 2: User switches workspace — query goes to loading state
		const step2 = tracker.update(undefined);
		expect(step2).toBe(false);

		// Step 3: Workspace B loads — this MUST trigger invalidation
		const step3 = tracker.update("/path/to/workspace-b");
		expect(step3).toBe(true);
	});

	test("preserves previous path across multiple undefined transitions", () => {
		const tracker = createWorktreePathTracker();
		tracker.update("/path/to/workspace-a");

		// Multiple undefined transitions (e.g. rapid workspace switching)
		tracker.update(undefined);
		tracker.update(undefined);
		tracker.update(undefined);

		// Final workspace loads
		expect(tracker.update("/path/to/workspace-b")).toBe(true);
	});

	test("does not invalidate when returning to the same workspace after undefined", () => {
		const tracker = createWorktreePathTracker();
		tracker.update("/path/to/workspace-a");

		// Transient undefined
		tracker.update(undefined);

		// Same workspace reloads (e.g. query refetch)
		expect(tracker.update("/path/to/workspace-a")).toBe(false);
	});
});
