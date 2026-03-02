import simpleGit from "simple-git";
import { runWithPostCheckoutHookTolerance } from "../../utils/git-hook-tolerance";
import { getProcessEnvWithShellPath } from "../../workspaces/utils/shell-env";
import {
	assertRegisteredWorktree,
	assertValidGitPath,
} from "./path-validation";

/**
 * Git command helpers with semantic naming.
 *
 * Design principle: Different functions for different git semantics.
 * You can't accidentally use file checkout syntax for branch switching.
 *
 * Each function:
 * 1. Validates worktree is registered
 * 2. Validates paths/refs as appropriate
 * 3. Uses the correct git command syntax
 */

async function getGitWithShellPath(worktreePath: string) {
	const git = simpleGit(worktreePath);
	git.env(await getProcessEnvWithShellPath());
	return git;
}

async function isCurrentBranch({
	worktreePath,
	expectedBranch,
}: {
	worktreePath: string;
	expectedBranch: string;
}): Promise<boolean> {
	try {
		const git = await getGitWithShellPath(worktreePath);
		const currentBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
		return currentBranch === expectedBranch;
	} catch {
		return false;
	}
}

/**
 * Switch to a branch.
 *
 * Uses `git switch` (unambiguous branch operation, git 2.23+).
 * Falls back to `git checkout <branch>` for older git versions.
 *
 * Note: `git checkout -- <branch>` is WRONG - that's file checkout syntax.
 */
export async function gitSwitchBranch(
	worktreePath: string,
	branch: string,
): Promise<void> {
	assertRegisteredWorktree(worktreePath);

	// Validate: reject anything that looks like a flag
	if (branch.startsWith("-")) {
		throw new Error("Invalid branch name: cannot start with -");
	}

	// Validate: reject empty branch names
	if (!branch.trim()) {
		throw new Error("Invalid branch name: cannot be empty");
	}

	const git = await getGitWithShellPath(worktreePath);

	await runWithPostCheckoutHookTolerance({
		context: `Switched branch to "${branch}" in ${worktreePath}`,
		run: async () => {
			try {
				// Prefer `git switch` - unambiguous branch operation (git 2.23+)
				await git.raw(["switch", branch]);
			} catch (switchError) {
				// Check if it's because `switch` command doesn't exist (old git < 2.23)
				// Git outputs: "git: 'switch' is not a git command. See 'git --help'."
				const errorMessage = String(switchError);
				if (errorMessage.includes("is not a git command")) {
					// Fallback for older git versions
					// Note: checkout WITHOUT -- is correct for branches
					await git.checkout(branch);
				} else {
					throw switchError;
				}
			}
		},
		didSucceed: async () =>
			isCurrentBranch({ worktreePath, expectedBranch: branch }),
	});
}

/**
 * Checkout (restore) a file path, discarding local changes.
 *
 * Uses `git checkout -- <path>` - the `--` is REQUIRED here
 * to indicate path mode (not branch mode).
 */
export async function gitCheckoutFile(
	worktreePath: string,
	filePath: string,
): Promise<void> {
	assertRegisteredWorktree(worktreePath);
	assertValidGitPath(filePath);

	const git = await getGitWithShellPath(worktreePath);
	// `--` is correct here - we want path semantics
	await git.checkout(["--", filePath]);
}

/**
 * Stage a file for commit.
 *
 * Uses `git add -- <path>` - the `--` prevents paths starting
 * with `-` from being interpreted as flags.
 */
export async function gitStageFile(
	worktreePath: string,
	filePath: string,
): Promise<void> {
	assertRegisteredWorktree(worktreePath);
	assertValidGitPath(filePath);

	const git = await getGitWithShellPath(worktreePath);
	await git.add(["--", filePath]);
}

/**
 * Stage multiple files for commit in a single git command.
 *
 * Uses `git add -- <paths...>` to avoid index.lock races
 * when staging multiple files.
 */
export async function gitStageFiles(
	worktreePath: string,
	filePaths: string[],
): Promise<void> {
	if (filePaths.length === 0) {
		throw new Error("filePaths must not be empty");
	}
	assertRegisteredWorktree(worktreePath);
	for (const filePath of filePaths) {
		assertValidGitPath(filePath);
	}

	const git = simpleGit(worktreePath);
	await git.add(["--", ...filePaths]);
}

/**
 * Unstage multiple files in a single git command.
 *
 * Uses `git reset HEAD -- <paths...>` to avoid index.lock races
 * when unstaging multiple files.
 */
export async function gitUnstageFiles(
	worktreePath: string,
	filePaths: string[],
): Promise<void> {
	if (filePaths.length === 0) {
		throw new Error("filePaths must not be empty");
	}
	assertRegisteredWorktree(worktreePath);
	for (const filePath of filePaths) {
		assertValidGitPath(filePath);
	}

	const git = simpleGit(worktreePath);
	await git.reset(["HEAD", "--", ...filePaths]);
}

/**
 * Stage all changes for commit.
 *
 * Uses `git add -A` to stage all changes (new, modified, deleted).
 */
export async function gitStageAll(worktreePath: string): Promise<void> {
	assertRegisteredWorktree(worktreePath);

	const git = await getGitWithShellPath(worktreePath);
	await git.add("-A");
}

/**
 * Unstage a file (remove from staging area).
 *
 * Uses `git reset HEAD -- <path>` to unstage without
 * discarding changes.
 */
export async function gitUnstageFile(
	worktreePath: string,
	filePath: string,
): Promise<void> {
	assertRegisteredWorktree(worktreePath);
	assertValidGitPath(filePath);

	const git = await getGitWithShellPath(worktreePath);
	await git.reset(["HEAD", "--", filePath]);
}

/**
 * Unstage all files.
 *
 * Uses `git reset HEAD` to unstage all changes without
 * discarding them.
 */
export async function gitUnstageAll(worktreePath: string): Promise<void> {
	assertRegisteredWorktree(worktreePath);

	const git = await getGitWithShellPath(worktreePath);
	await git.reset(["HEAD"]);
}

/**
 * Discard all unstaged changes (modified and deleted files).
 *
 * Uses `git checkout -- .` to restore all tracked files to HEAD state.
 * Does NOT affect untracked files.
 */
export async function gitDiscardAllUnstaged(
	worktreePath: string,
): Promise<void> {
	assertRegisteredWorktree(worktreePath);

	const git = await getGitWithShellPath(worktreePath);
	await git.checkout(["--", "."]);
}

/**
 * Discard all staged changes by unstaging then discarding.
 *
 * Uses `git reset HEAD` followed by `git checkout -- .`.
 * Does NOT affect untracked files.
 */
export async function gitDiscardAllStaged(worktreePath: string): Promise<void> {
	assertRegisteredWorktree(worktreePath);

	const git = await getGitWithShellPath(worktreePath);
	await git.reset(["HEAD"]);
	await git.checkout(["--", "."]);
}

/**
 * Stash all tracked changes.
 *
 * Uses `git stash push` to save current work-in-progress.
 */
export async function gitStash(worktreePath: string): Promise<void> {
	assertRegisteredWorktree(worktreePath);

	const git = await getGitWithShellPath(worktreePath);
	await git.stash(["push"]);
}

/**
 * Stash all changes including untracked files.
 *
 * Uses `git stash push --include-untracked`.
 */
export async function gitStashIncludeUntracked(
	worktreePath: string,
): Promise<void> {
	assertRegisteredWorktree(worktreePath);

	const git = await getGitWithShellPath(worktreePath);
	await git.stash(["push", "--include-untracked"]);
}

/**
 * Pop the most recent stash.
 *
 * Uses `git stash pop` to apply and remove the top stash entry.
 * Throws if no stash exists or if there are conflicts.
 */
export async function gitStashPop(worktreePath: string): Promise<void> {
	assertRegisteredWorktree(worktreePath);

	const git = await getGitWithShellPath(worktreePath);
	await git.stash(["pop"]);
}
