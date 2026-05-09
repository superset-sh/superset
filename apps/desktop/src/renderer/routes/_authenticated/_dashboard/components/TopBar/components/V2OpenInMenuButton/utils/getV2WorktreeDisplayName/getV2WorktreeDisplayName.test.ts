import { describe, expect, test } from "bun:test";
import { getV2WorktreeDisplayName } from "./getV2WorktreeDisplayName";

describe("getV2WorktreeDisplayName", () => {
	const projectId = "proj-abc";

	test("returns the branch-at-creation directory name from a v2 worktree path", () => {
		const path = `/home/user/.superset/worktrees/${projectId}/andrew/foo`;
		expect(getV2WorktreeDisplayName(path, projectId)).toBe("andrew/foo");
	});

	test("preserves nested slashed branch names", () => {
		const path = `/home/user/.superset/worktrees/${projectId}/feat/users/list`;
		expect(getV2WorktreeDisplayName(path, projectId)).toBe("feat/users/list");
	});

	test("does NOT change with the workspace's current branch — the fix scenario from #3759", () => {
		// Workspace was created from `andrew/foo`, so the directory is fixed there.
		// After stacked PR navigation, `workspaces.branch` becomes `andrew/foo-2`.
		// The displayed label must reflect the on-disk directory, not the live branch.
		const persistedPath = `/home/user/.superset/worktrees/${projectId}/andrew/foo`;
		const liveBranchAfterStackNavigation = "andrew/foo-2";

		const display = getV2WorktreeDisplayName(persistedPath, projectId);

		expect(display).toBe("andrew/foo");
		expect(display).not.toBe(liveBranchAfterStackNavigation);
	});

	test("falls back to the basename if the projectId marker is absent", () => {
		const path = "/some/other/location/my-branch";
		expect(getV2WorktreeDisplayName(path, projectId)).toBe("my-branch");
	});

	test("handles Windows-style separators in the fallback", () => {
		const path = "C:\\Users\\me\\some\\place\\my-branch";
		expect(getV2WorktreeDisplayName(path, projectId)).toBe("my-branch");
	});

	test("returns the original string if no separator is present", () => {
		expect(getV2WorktreeDisplayName("standalone", projectId)).toBe(
			"standalone",
		);
	});
});
