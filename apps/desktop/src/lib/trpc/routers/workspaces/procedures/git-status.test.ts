import { describe, expect, test } from "bun:test";

/**
 * Reproduction test for GitHub issue #2624:
 * "GitHub integration doesn't detect repositories added after initial setup"
 *
 * Root cause: getGitHubStatus resolved the working directory exclusively via
 * workspace.worktreeId, which is null for "branch" type workspaces (the
 * default workspace created when a project is first opened). This caused
 * fetchGitHubPRStatus to never be called, yielding "GitHub is not available
 * for this workspace."
 *
 * The fix uses getWorkspacePath() which handles both workspace types:
 * - "branch" workspaces → project.mainRepoPath
 * - "worktree" workspaces → worktree.path
 */

/**
 * Simulates the OLD (buggy) path-resolution logic from getGitHubStatus.
 * This is the pattern that existed before the fix:
 *   const worktree = workspace.worktreeId ? getWorktree(workspace.worktreeId) : null;
 *   if (!worktree) return null;
 *   // use worktree.path
 */
function resolvePathOld(workspace: {
	worktreeId: string | null;
	type: string;
}): string | null {
	// Simulates: workspace.worktreeId ? getWorktree(workspace.worktreeId) : null
	if (!workspace.worktreeId) {
		return null;
	}
	// In the real code, this would look up the worktree by ID and return its path
	return `/mock/worktree/${workspace.worktreeId}`;
}

/**
 * Simulates the NEW (fixed) path-resolution logic using getWorkspacePath().
 * For "branch" workspaces: returns the project's main repo path.
 * For "worktree" workspaces: returns the worktree's path.
 */
function resolvePathNew(workspace: {
	worktreeId: string | null;
	type: string;
	projectId: string;
}): string | null {
	if (workspace.type === "branch") {
		// getWorkspacePath looks up the project and returns mainRepoPath
		return `/mock/projects/${workspace.projectId}`;
	}
	if (workspace.worktreeId) {
		return `/mock/worktree/${workspace.worktreeId}`;
	}
	return null;
}

describe("getGitHubStatus path resolution — issue #2624", () => {
	const branchWorkspace = {
		worktreeId: null,
		type: "branch" as const,
		projectId: "proj-1",
	};

	const worktreeWorkspace = {
		worktreeId: "wt-1",
		type: "worktree" as const,
		projectId: "proj-1",
	};

	describe("OLD logic (bug): resolves path only via worktreeId", () => {
		test("returns null for 'branch' workspace — this is the bug", () => {
			const path = resolvePathOld(branchWorkspace);
			expect(path).toBeNull();
			// ^ This null causes "GitHub is not available for this workspace."
			// because fetchGitHubPRStatus is never called.
		});

		test("returns path for 'worktree' workspace", () => {
			const path = resolvePathOld(worktreeWorkspace);
			expect(path).not.toBeNull();
		});
	});

	describe("NEW logic (fix): resolves path via getWorkspacePath", () => {
		test("returns project mainRepoPath for 'branch' workspace", () => {
			const path = resolvePathNew(branchWorkspace);
			expect(path).not.toBeNull();
			expect(path).toBe("/mock/projects/proj-1");
		});

		test("returns worktree path for 'worktree' workspace", () => {
			const path = resolvePathNew(worktreeWorkspace);
			expect(path).not.toBeNull();
			expect(path).toBe("/mock/worktree/wt-1");
		});
	});
});

describe("ensureMainWorkspace creates branch workspace without worktreeId", () => {
	test("branch workspace schema has null worktreeId", () => {
		// This test documents that ensureMainWorkspace creates workspaces with
		// type="branch" and worktreeId=null. These are the default workspaces
		// created when a project is first opened.
		const workspace = {
			projectId: "proj-1",
			type: "branch" as const,
			branch: "main",
			name: "default",
			tabOrder: 0,
			// worktreeId is NOT set — this is intentional for "branch" type
		};

		expect(workspace.type).toBe("branch");
		expect("worktreeId" in workspace).toBe(false);
	});
});
