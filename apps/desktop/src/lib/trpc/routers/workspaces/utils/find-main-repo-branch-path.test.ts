import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findMainRepoBranchPath, getBranchWorktreePath } from "./git";

const TEST_DIR = join(
	realpathSync(tmpdir()),
	`superset-test-main-repo-branch-${process.pid}`,
);

function createTestRepo(name: string): string {
	const repoPath = join(TEST_DIR, name);
	mkdirSync(repoPath, { recursive: true });
	execSync("git init -b main", { cwd: repoPath, stdio: "ignore" });
	execSync("git config user.email 'test@test.com'", {
		cwd: repoPath,
		stdio: "ignore",
	});
	execSync("git config user.name 'Test'", { cwd: repoPath, stdio: "ignore" });
	writeFileSync(join(repoPath, "README.md"), "# test\n");
	execSync("git add . && git commit -m 'init'", {
		cwd: repoPath,
		stdio: "ignore",
	});
	return repoPath;
}

function addWorktree(
	mainRepoPath: string,
	branch: string,
	worktreePath: string,
): void {
	mkdirSync(worktreePath, { recursive: true });
	execSync(`git worktree add "${worktreePath}" -b ${branch}`, {
		cwd: mainRepoPath,
		stdio: "ignore",
	});
}

/**
 * Reproduction for issue #4523.
 *
 * A user accidentally deletes the "main" workspace from Superset's sidebar.
 * The main git repository (and its branch checkout) is untouched on disk,
 * but Superset's DB no longer has a `type:"branch"` workspace row pointing
 * at it. When the user clicks "+ Add worktree" and types the mainline
 * branch name, the existing flow fails: `getBranchWorktreePath` finds the
 * branch already checked out at the main repo and the create procedure
 * either throws "already checked out" or falls through to `git worktree
 * add` which itself refuses (you can't check out the same branch twice).
 *
 * `findMainRepoBranchPath` is the precondition for recovery — it tells
 * callers "this conflict IS the main repo, so adopt as a branch workspace
 * rather than failing."
 */
describe("findMainRepoBranchPath (issue #4523 reproduction)", () => {
	let mainRepoPath: string;
	let originalGitEditor: string | undefined;

	beforeEach(() => {
		// simple-git refuses to spawn when GIT_EDITOR is inherited from the
		// environment (CI sets it). Desktop runtime never sets it, so strip it
		// for the duration of the test.
		originalGitEditor = process.env.GIT_EDITOR;
		delete process.env.GIT_EDITOR;

		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
		mkdirSync(TEST_DIR, { recursive: true });
		mainRepoPath = createTestRepo("main-repo");
	});

	afterEach(() => {
		if (originalGitEditor !== undefined) {
			process.env.GIT_EDITOR = originalGitEditor;
		}
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test("getBranchWorktreePath returns the main repo path for the mainline branch (the bug trigger)", async () => {
		// Precondition: the main repo has "main" checked out. Today, this
		// causes the create-worktree flow to reject with "branch is already
		// checked out at <mainRepoPath>" — leaving the user with no way to
		// re-add their mainline workspace after accidentally deleting it.
		const path = await getBranchWorktreePath({
			mainRepoPath,
			branch: "main",
		});
		expect(path).toBe(mainRepoPath);
	});

	test("returns mainRepoPath when the branch is checked out at the main repo", async () => {
		const result = await findMainRepoBranchPath({
			mainRepoPath,
			branch: "main",
		});
		expect(result).toBe(mainRepoPath);
	});

	test("returns null when the branch is checked out in a separate worktree (a real conflict)", async () => {
		const otherWorktree = join(TEST_DIR, "feature-wt");
		addWorktree(mainRepoPath, "feature-x", otherWorktree);

		const result = await findMainRepoBranchPath({
			mainRepoPath,
			branch: "feature-x",
		});
		expect(result).toBeNull();
	});

	test("returns null when the branch doesn't exist", async () => {
		const result = await findMainRepoBranchPath({
			mainRepoPath,
			branch: "does-not-exist",
		});
		expect(result).toBeNull();
	});

	test("still detects the main repo when other worktrees exist for other branches", async () => {
		addWorktree(mainRepoPath, "feature-a", join(TEST_DIR, "wt-a"));
		addWorktree(mainRepoPath, "feature-b", join(TEST_DIR, "wt-b"));

		const result = await findMainRepoBranchPath({
			mainRepoPath,
			branch: "main",
		});
		expect(result).toBe(mainRepoPath);
	});
});
