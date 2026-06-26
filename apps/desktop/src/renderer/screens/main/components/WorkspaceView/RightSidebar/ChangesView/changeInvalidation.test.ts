import { describe, expect, test } from "bun:test";
import type { FileSystemChangeEvent } from "shared/file-tree-types";
import {
	accumulateContentInvalidation,
	createEmptyContentInvalidationPlan,
} from "./changeInvalidation";

function updateEvent(absolutePath: string): FileSystemChangeEvent {
	return { type: "update", absolutePath, revision: 1 };
}

describe("content invalidation planning (issue #5001)", () => {
	// Reproduces the bug: a follow-up edit to a file the user is NOT currently
	// "selecting" must still invalidate that file's content queries. Previously
	// invalidation was gated on the event targeting the selected file, so the
	// inline diff for any other changed file kept showing the first round of
	// changes (a stale change set).
	test("invalidates the edited file even when it is not the selected file", () => {
		const selectedPath = "/repo/src/a.ts";
		const editedButUnselectedPath = "/repo/src/filter-catalog.ts";

		const plan = accumulateContentInvalidation(
			createEmptyContentInvalidationPlan(),
			updateEvent(editedButUnselectedPath),
		);

		// The bug was that nothing other than `selectedPath` ever got invalidated.
		expect(plan.contentPaths.has(editedButUnselectedPath)).toBe(true);
		expect(plan.contentPaths.has(selectedPath)).toBe(false);
		expect(plan.invalidateAllContent).toBe(false);
	});

	test("accumulates multiple changed files from a batch of events", () => {
		let plan = createEmptyContentInvalidationPlan();
		plan = accumulateContentInvalidation(plan, updateEvent("/repo/a.ts"));
		plan = accumulateContentInvalidation(plan, updateEvent("/repo/b.ts"));

		expect([...plan.contentPaths].sort()).toEqual(["/repo/a.ts", "/repo/b.ts"]);
	});

	test("a rename invalidates both the old and new paths", () => {
		const plan = accumulateContentInvalidation(
			createEmptyContentInvalidationPlan(),
			{
				type: "rename",
				absolutePath: "/repo/new.ts",
				oldAbsolutePath: "/repo/old.ts",
				revision: 2,
			},
		);

		expect(plan.contentPaths.has("/repo/new.ts")).toBe(true);
		expect(plan.contentPaths.has("/repo/old.ts")).toBe(true);
	});

	test("a watcher overflow falls back to broad invalidation", () => {
		const plan = accumulateContentInvalidation(
			createEmptyContentInvalidationPlan(),
			{ type: "overflow", revision: 3 },
		);

		expect(plan.invalidateAllContent).toBe(true);
		expect(plan.invalidateBranches).toBe(true);
	});
});
