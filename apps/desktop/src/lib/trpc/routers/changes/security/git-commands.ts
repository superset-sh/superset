import simpleGit from "simple-git";
import { runWithPostCheckoutHookTolerance } from "../../utils/git-hook-tolerance";
import type { GitRunner } from "../utils/git-runner";
import {
	assertRegisteredWorkspacePath,
	assertValidGitPath,
} from "./path-validation";

/**
 * Git command helpers with semantic naming.
 *
 * Each function accepts an optional GitRunner. If provided, commands run
 * through the runner (which may be local or remote). If not provided,
 * commands use simpleGit for backwards compatibility with local-only callers.
 */

async function isCurrentBranch({
	worktreePath,
	expectedBranch,
	runner,
}: {
	worktreePath: string;
	expectedBranch: string;
	runner?: GitRunner;
}): Promise<boolean> {
	try {
		if (runner) {
			const branch = (
				await runner.raw(["rev-parse", "--abbrev-ref", "HEAD"])
			).trim();
			return branch === expectedBranch;
		}
		const git = simpleGit(worktreePath);
		const currentBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
		return currentBranch === expectedBranch;
	} catch {
		return false;
	}
}

/**
 * Switch to a branch.
 */
export async function gitSwitchBranch(
	worktreePath: string,
	branch: string,
	runner?: GitRunner,
): Promise<void> {
	assertRegisteredWorkspacePath(worktreePath);

	if (branch.startsWith("-")) {
		throw new Error("Invalid branch name: cannot start with -");
	}
	if (!branch.trim()) {
		throw new Error("Invalid branch name: cannot be empty");
	}

	if (runner) {
		await runWithPostCheckoutHookTolerance({
			context: `Switched branch to "${branch}" in ${worktreePath}`,
			run: async () => {
				try {
					await runner.raw(["switch", branch]);
				} catch (switchError) {
					const errorMessage = String(switchError);
					if (errorMessage.includes("is not a git command")) {
						await runner.raw(["checkout", branch]);
					} else {
						throw switchError;
					}
				}
			},
			didSucceed: async () =>
				isCurrentBranch({ worktreePath, expectedBranch: branch, runner }),
		});
		return;
	}

	const git = simpleGit(worktreePath);
	await runWithPostCheckoutHookTolerance({
		context: `Switched branch to "${branch}" in ${worktreePath}`,
		run: async () => {
			try {
				await git.raw(["switch", branch]);
			} catch (switchError) {
				const errorMessage = String(switchError);
				if (errorMessage.includes("is not a git command")) {
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
 */
export async function gitCheckoutFile(
	worktreePath: string,
	filePath: string,
	runner?: GitRunner,
): Promise<void> {
	assertRegisteredWorkspacePath(worktreePath);
	assertValidGitPath(filePath);

	if (runner) {
		await runner.raw(["checkout", "--", filePath]);
		return;
	}

	const git = simpleGit(worktreePath);
	await git.checkout(["--", filePath]);
}

/**
 * Stage a file for commit.
 */
export async function gitStageFile(
	worktreePath: string,
	filePath: string,
	runner?: GitRunner,
): Promise<void> {
	assertRegisteredWorkspacePath(worktreePath);
	assertValidGitPath(filePath);

	if (runner) {
		await runner.raw(["add", "--", filePath]);
		return;
	}

	const git = simpleGit(worktreePath);
	await git.add(["--", filePath]);
}

/**
 * Stage all changes for commit.
 */
export async function gitStageAll(
	worktreePath: string,
	runner?: GitRunner,
): Promise<void> {
	assertRegisteredWorkspacePath(worktreePath);

	if (runner) {
		await runner.raw(["add", "-A"]);
		return;
	}

	const git = simpleGit(worktreePath);
	await git.add("-A");
}

/**
 * Unstage a file (remove from staging area).
 */
export async function gitUnstageFile(
	worktreePath: string,
	filePath: string,
	runner?: GitRunner,
): Promise<void> {
	assertRegisteredWorkspacePath(worktreePath);
	assertValidGitPath(filePath);

	if (runner) {
		await runner.raw(["reset", "HEAD", "--", filePath]);
		return;
	}

	const git = simpleGit(worktreePath);
	await git.reset(["HEAD", "--", filePath]);
}

/**
 * Unstage all files.
 */
export async function gitUnstageAll(
	worktreePath: string,
	runner?: GitRunner,
): Promise<void> {
	assertRegisteredWorkspacePath(worktreePath);

	if (runner) {
		await runner.raw(["reset", "HEAD"]);
		return;
	}

	const git = simpleGit(worktreePath);
	await git.reset(["HEAD"]);
}

/**
 * Discard all unstaged changes (modified and deleted files).
 */
export async function gitDiscardAllUnstaged(
	worktreePath: string,
	runner?: GitRunner,
): Promise<void> {
	assertRegisteredWorkspacePath(worktreePath);

	if (runner) {
		await runner.raw(["checkout", "--", "."]);
		return;
	}

	const git = simpleGit(worktreePath);
	await git.checkout(["--", "."]);
}

/**
 * Discard all staged changes by unstaging then discarding.
 */
export async function gitDiscardAllStaged(
	worktreePath: string,
	runner?: GitRunner,
): Promise<void> {
	assertRegisteredWorkspacePath(worktreePath);

	if (runner) {
		await runner.raw(["reset", "HEAD"]);
		await runner.raw(["checkout", "--", "."]);
		return;
	}

	const git = simpleGit(worktreePath);
	await git.reset(["HEAD"]);
	await git.checkout(["--", "."]);
}

/**
 * Stash all tracked changes.
 */
export async function gitStash(
	worktreePath: string,
	runner?: GitRunner,
): Promise<void> {
	assertRegisteredWorkspacePath(worktreePath);

	if (runner) {
		await runner.raw(["stash", "push"]);
		return;
	}

	const git = simpleGit(worktreePath);
	await git.stash(["push"]);
}

/**
 * Stash all changes including untracked files.
 */
export async function gitStashIncludeUntracked(
	worktreePath: string,
	runner?: GitRunner,
): Promise<void> {
	assertRegisteredWorkspacePath(worktreePath);

	if (runner) {
		await runner.raw(["stash", "push", "--include-untracked"]);
		return;
	}

	const git = simpleGit(worktreePath);
	await git.stash(["push", "--include-untracked"]);
}

/**
 * Pop the most recent stash.
 */
export async function gitStashPop(
	worktreePath: string,
	runner?: GitRunner,
): Promise<void> {
	assertRegisteredWorkspacePath(worktreePath);

	if (runner) {
		await runner.raw(["stash", "pop"]);
		return;
	}

	const git = simpleGit(worktreePath);
	await git.stash(["pop"]);
}
