import { execFile } from "node:child_process";
import { promisify } from "node:util";

import simpleGit from "simple-git";

import { getCurrentBranch } from "./branch";
import { getGitEnv } from "./shell-env";
import type {
	CheckoutSafetyResult,
	ExecFileException,
	StatusResult,
} from "./types";

const execFileAsync = promisify(execFile);

function isExecFileException(error: unknown): error is ExecFileException {
	return (
		error instanceof Error &&
		("code" in error || "signal" in error || "killed" in error)
	);
}

/**
 * Parses git status --porcelain=v1 -z output into a StatusResult-compatible object.
 */
function parsePortelainStatus(stdout: string): StatusResult {
	const entries = stdout.split("\0").filter(Boolean);

	let current: string | null = null;
	let tracking: string | null = null;
	let isDetached = false;

	const files: StatusResult["files"] = [];
	const stagedSet = new Set<string>();
	const modifiedSet = new Set<string>();
	const deletedSet = new Set<string>();
	const createdSet = new Set<string>();
	const renamed: Array<{ from: string; to: string }> = [];
	const conflictedSet = new Set<string>();
	const notAddedSet = new Set<string>();

	let i = 0;
	while (i < entries.length) {
		const entry = entries[i];
		if (!entry) {
			i++;
			continue;
		}

		if (entry.startsWith("## ")) {
			const branchInfo = entry.slice(3);

			if (branchInfo.startsWith("HEAD (no branch)") || branchInfo === "HEAD") {
				isDetached = true;
				current = "HEAD";
			} else if (
				branchInfo.startsWith("No commits yet on ") ||
				branchInfo.startsWith("Initial commit on ")
			) {
				const parts = branchInfo.split(" ");
				current = parts[parts.length - 1] || null;
			} else {
				const trackingMatch = branchInfo.match(/^(.+?)\.\.\.(.+?)(?:\s|$)/);
				if (trackingMatch?.[1] && trackingMatch[2]) {
					current = trackingMatch[1];
					tracking = trackingMatch[2].split(" ")[0] ?? null;
				} else {
					current = branchInfo.split(" ")[0] ?? null;
				}
			}
			i++;
			continue;
		}

		if (entry.length < 3) {
			i++;
			continue;
		}

		const indexStatus = entry[0] ?? " ";
		const workingStatus = entry[1] ?? " ";
		const path = entry.slice(3);
		let from: string | undefined;

		if (indexStatus === "R" || indexStatus === "C") {
			i++;
			from = entries[i];
			renamed.push({ from: from || path, to: path });
		}

		files.push({
			path,
			from: from ?? path,
			index: indexStatus,
			working_dir: workingStatus,
		});

		if (indexStatus === "?" && workingStatus === "?") {
			notAddedSet.add(path);
		} else {
			if (indexStatus === "A") createdSet.add(path);
			else if (indexStatus === "M") {
				stagedSet.add(path);
				modifiedSet.add(path);
			} else if (indexStatus === "D") {
				stagedSet.add(path);
				deletedSet.add(path);
			} else if (indexStatus === "R" || indexStatus === "C")
				stagedSet.add(path);
			else if (indexStatus === "U") conflictedSet.add(path);
			else if (indexStatus !== " " && indexStatus !== "?") stagedSet.add(path);

			if (workingStatus === "M") modifiedSet.add(path);
			else if (workingStatus === "D") deletedSet.add(path);
			else if (workingStatus === "U") conflictedSet.add(path);
		}

		i++;
	}

	return {
		not_added: [...notAddedSet],
		conflicted: [...conflictedSet],
		created: [...createdSet],
		deleted: [...deletedSet],
		ignored: undefined,
		modified: [...modifiedSet],
		renamed,
		files,
		staged: [...stagedSet],
		ahead: 0,
		behind: 0,
		current,
		tracking,
		detached: isDetached,
		isClean: () =>
			files.length === 0 ||
			files.every((f) => f.index === "?" && f.working_dir === "?"),
	};
}

/**
 * Runs git status without holding locks on the repository.
 */
export async function getStatusNoLock(repoPath: string): Promise<StatusResult> {
	const env = await getGitEnv();

	try {
		const { stdout } = await execFileAsync(
			"git",
			[
				"--no-optional-locks",
				"-C",
				repoPath,
				"status",
				"--porcelain=v1",
				"-b",
				"-z",
				"-M",
				"-uall",
			],
			{ env, timeout: 30_000 },
		);

		return parsePortelainStatus(stdout);
	} catch (error) {
		if (isExecFileException(error)) {
			if (error.code === "ENOENT") {
				throw new Error("Git is not installed or not found in PATH");
			}
			const stderr = error.stderr || error.message || "";
			if (stderr.includes("not a git repository")) {
				throw new Error(`Not a git repository: ${repoPath}`);
			}
		}
		throw new Error(
			`Failed to get git status: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Checks if the repository has uncommitted changes.
 */
export async function hasUncommittedChanges(
	worktreePath: string,
): Promise<boolean> {
	const status = await getStatusNoLock(worktreePath);
	return !status.isClean();
}

/**
 * Checks if the repository has unpushed commits.
 */
export async function hasUnpushedCommits(
	worktreePath: string,
): Promise<boolean> {
	const git = simpleGit(worktreePath);
	try {
		const aheadCount = await git.raw([
			"rev-list",
			"--count",
			"@{upstream}..HEAD",
		]);
		return Number.parseInt(aheadCount.trim(), 10) > 0;
	} catch {
		try {
			const localCommits = await git.raw([
				"rev-list",
				"--count",
				"HEAD",
				"--not",
				"--remotes",
			]);
			return Number.parseInt(localCommits.trim(), 10) > 0;
		} catch {
			return false;
		}
	}
}

/**
 * Checks if the worktree needs to be rebased.
 */
export async function checkNeedsRebase({
	worktreePath,
	defaultBranch,
}: {
	worktreePath: string;
	defaultBranch: string;
}): Promise<boolean> {
	const git = simpleGit(worktreePath);
	const behindCount = await git.raw([
		"rev-list",
		"--count",
		`HEAD..origin/${defaultBranch}`,
	]);
	return Number.parseInt(behindCount.trim(), 10) > 0;
}

/**
 * Performs safety checks before a branch checkout.
 */
export async function checkBranchCheckoutSafety(
	repoPath: string,
): Promise<CheckoutSafetyResult> {
	try {
		const status = await getStatusNoLock(repoPath);

		const hasUncommittedChanges =
			status.staged.length > 0 ||
			status.modified.length > 0 ||
			status.deleted.length > 0 ||
			status.created.length > 0 ||
			status.renamed.length > 0 ||
			status.conflicted.length > 0;

		const hasUntrackedFiles = status.not_added.length > 0;

		if (hasUncommittedChanges) {
			return {
				safe: false,
				error:
					"Cannot switch branches: you have uncommitted changes. Please commit or stash your changes first.",
				hasUncommittedChanges: true,
				hasUntrackedFiles,
			};
		}

		if (hasUntrackedFiles) {
			return {
				safe: false,
				error:
					"Cannot switch branches: you have untracked files that may be overwritten. Please commit, stash, or remove them first.",
				hasUncommittedChanges: false,
				hasUntrackedFiles: true,
			};
		}

		try {
			const git = simpleGit(repoPath);
			await git.fetch(["--prune"]);
		} catch {
			// Ignore fetch errors
		}

		return {
			safe: true,
			hasUncommittedChanges: false,
			hasUntrackedFiles: false,
		};
	} catch (error) {
		return {
			safe: false,
			error: `Failed to check repository status: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

/**
 * Safe branch checkout that performs safety checks first.
 */
export async function safeCheckoutBranch(
	repoPath: string,
	branch: string,
): Promise<void> {
	const { checkoutBranch } = await import("./branch");

	const currentBranch = await getCurrentBranch(repoPath);
	if (currentBranch === branch) {
		return;
	}

	const safety = await checkBranchCheckoutSafety(repoPath);
	if (!safety.safe) {
		throw new Error(safety.error);
	}

	await checkoutBranch(repoPath, branch);

	const verifyBranch = await getCurrentBranch(repoPath);
	if (verifyBranch !== branch) {
		throw new Error(
			`Branch checkout verification failed: expected "${branch}" but HEAD is on "${verifyBranch ?? "detached HEAD"}"`,
		);
	}
}
