import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { workspaceInitManager } from "main/lib/workspace-init-manager";
import { initializeWorkspaceWorktree } from "./workspace-init";

/**
 * Creates a local bare "remote" repo and clones it, simulating a user who
 * clones a freshly-created (empty) GitHub/GitLab repository.
 */
function createEmptyClonedRepo(testDir: string): {
	bareRemotePath: string;
	clonedRepoPath: string;
} {
	const bareRemotePath = join(testDir, "empty-remote.git");
	mkdirSync(bareRemotePath, { recursive: true });
	// Bare repo with no commits (like a brand-new GitHub repo)
	execSync("git init --bare", { cwd: bareRemotePath, stdio: "ignore" });

	const clonedRepoPath = join(testDir, "cloned-repo");
	// Clone the empty remote — git warns "You appear to have cloned an empty repository"
	execSync(`git clone "${bareRemotePath}" "${clonedRepoPath}"`, {
		stdio: "pipe",
	});
	execSync("git config user.email 'test@test.com'", {
		cwd: clonedRepoPath,
		stdio: "ignore",
	});
	execSync("git config user.name 'Test'", {
		cwd: clonedRepoPath,
		stdio: "ignore",
	});

	return { bareRemotePath, clonedRepoPath };
}

describe("workspace-init for empty repo (issue #1663)", () => {
	let testDir: string;
	let clonedRepoPath: string;
	let workspaceId: string;
	const projectId = "test-project-id";
	const worktreeId = "test-worktree-id";

	beforeEach(() => {
		workspaceId = `test-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		testDir = join(
			realpathSync(tmpdir()),
			`superset-test-empty-repo-${Date.now()}`,
		);
		mkdirSync(testDir, { recursive: true });

		const repos = createEmptyClonedRepo(testDir);
		clonedRepoPath = repos.clonedRepoPath;

		// Mirror what create.ts does before calling initializeWorkspaceWorktree
		workspaceInitManager.startJob(workspaceId, projectId);
	});

	afterEach(() => {
		workspaceInitManager.clearJob(workspaceId);
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test("initialization should succeed for empty cloned repo instead of failing with 'No local reference available'", async () => {
		// Bug #1663: When a user creates a new GitHub/GitLab repo and immediately
		// clones it, the repo has no commits and no branches. The current workspace
		// init flow tries to resolve a base branch (e.g. "main") as a git start point
		// for worktree creation. Since the remote is empty, branchExistsOnRemote()
		// returns "not_found", and refExistsLocally() returns false for all common
		// branch names. This causes initializeWorkspaceWorktree to emit a "failed"
		// progress step with the error "No local reference available".
		//
		// Expected behavior: The workspace should still be accessible. The app should
		// detect the empty-repo scenario and open a terminal in the main repo directory
		// without attempting to create a git worktree.

		const worktreePath = join(testDir, "worktree");

		await initializeWorkspaceWorktree({
			workspaceId,
			projectId,
			worktreeId,
			worktreePath,
			branch: "feature/new-feature",
			mainRepoPath: clonedRepoPath,
		});

		const progress = workspaceInitManager.getProgress(workspaceId);

		// This assertion FAILS with the current code because workspace-init
		// transitions to "failed" instead of "ready" for empty repos.
		// The failure occurs when the code finds a local tracking ref "origin/main"
		// (created by git clone even for empty repos) but that ref doesn't resolve
		// to an actual commit, causing `git worktree add ... origin/main^{commit}`
		// to fail with "fatal: invalid reference: origin/main^{commit}".
		expect(progress?.step).toBe("ready");
	});
});
