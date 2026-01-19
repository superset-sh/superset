import { execFile } from "node:child_process";
import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import simpleGit from "simple-git";

import { checkGitLfsAvailable, getGitEnv } from "./shell-env";
import type { ExecFileException } from "./types";

const execFileAsync = promisify(execFile);

function isExecFileException(error: unknown): error is ExecFileException {
	return (
		error instanceof Error &&
		("code" in error || "signal" in error || "killed" in error)
	);
}

function isEnoent(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	);
}

async function repoUsesLfs(repoPath: string): Promise<boolean> {
	try {
		const lfsDir = join(repoPath, ".git", "lfs");
		const stats = await stat(lfsDir);
		if (stats.isDirectory()) {
			return true;
		}
	} catch (error) {
		if (!isEnoent(error)) {
			console.warn(`[git] Could not check .git/lfs directory: ${error}`);
		}
	}

	const attributeFiles = [
		join(repoPath, ".gitattributes"),
		join(repoPath, ".git", "info", "attributes"),
		join(repoPath, ".lfsconfig"),
	];

	for (const filePath of attributeFiles) {
		try {
			const content = await readFile(filePath, "utf-8");
			if (content.includes("filter=lfs") || content.includes("[lfs]")) {
				return true;
			}
		} catch (error) {
			if (!isEnoent(error)) {
				console.warn(`[git] Could not read ${filePath}: ${error}`);
			}
		}
	}

	try {
		const git = simpleGit(repoPath);
		const lsFiles = await git.raw(["ls-files"]);
		const sampleFiles = lsFiles.split("\n").filter(Boolean).slice(0, 20);

		if (sampleFiles.length > 0) {
			const checkAttr = await git.raw([
				"check-attr",
				"filter",
				"--",
				...sampleFiles,
			]);
			if (checkAttr.includes("filter: lfs")) {
				return true;
			}
		}
	} catch {
		// Ignore errors
	}

	return false;
}

/**
 * Creates a git worktree with a new branch.
 */
export async function createWorktree({
	mainRepoPath,
	branch,
	worktreePath,
	startPoint = "origin/main",
}: {
	mainRepoPath: string;
	branch: string;
	worktreePath: string;
	startPoint?: string;
}): Promise<void> {
	const usesLfs = await repoUsesLfs(mainRepoPath);

	try {
		const parentDir = join(worktreePath, "..");
		await mkdir(parentDir, { recursive: true });

		const env = await getGitEnv();

		if (usesLfs) {
			const lfsAvailable = await checkGitLfsAvailable(env);
			if (!lfsAvailable) {
				throw new Error(
					`This repository uses Git LFS, but git-lfs was not found. ` +
						`Please install git-lfs (e.g., 'brew install git-lfs') and run 'git lfs install'.`,
				);
			}
		}

		await execFileAsync(
			"git",
			[
				"-C",
				mainRepoPath,
				"worktree",
				"add",
				worktreePath,
				"-b",
				branch,
				// Append ^{commit} to force Git to treat the startPoint as a commit,
				// not a branch ref. This prevents implicit upstream tracking when
				// creating a new branch from a remote branch like origin/main.
				`${startPoint}^{commit}`,
			],
			{ env, timeout: 120_000 },
		);

		console.log(
			`Created worktree at ${worktreePath} with branch ${branch} from ${startPoint}`,
		);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const lowerError = errorMessage.toLowerCase();

		const isLockError =
			lowerError.includes("could not lock") ||
			lowerError.includes("unable to lock") ||
			(lowerError.includes(".lock") && lowerError.includes("file exists"));

		if (isLockError) {
			console.error(
				`Git lock file error during worktree creation: ${errorMessage}`,
			);
			throw new Error(
				`Failed to create worktree: The git repository is locked by another process. ` +
					`This usually happens when another git operation is in progress, or a previous operation crashed. ` +
					`Please wait for the other operation to complete, or manually remove the lock file ` +
					`(e.g., .git/config.lock or .git/index.lock) if you're sure no git operations are running.`,
			);
		}

		const isLfsError =
			lowerError.includes("git-lfs") ||
			lowerError.includes("filter-process") ||
			lowerError.includes("smudge filter") ||
			(lowerError.includes("lfs") && lowerError.includes("not")) ||
			(lowerError.includes("lfs") && usesLfs);

		if (isLfsError) {
			console.error(`Git LFS error during worktree creation: ${errorMessage}`);
			throw new Error(
				`Failed to create worktree: This repository uses Git LFS, but git-lfs was not found or failed. ` +
					`Please install git-lfs (e.g., 'brew install git-lfs') and run 'git lfs install'.`,
			);
		}

		console.error(`Failed to create worktree: ${errorMessage}`);
		throw new Error(`Failed to create worktree: ${errorMessage}`);
	}
}

/**
 * Removes a git worktree.
 */
export async function removeWorktree({
	mainRepoPath,
	worktreePath,
}: {
	mainRepoPath: string;
	worktreePath: string;
}): Promise<void> {
	try {
		const env = await getGitEnv();

		await execFileAsync(
			"git",
			["-C", mainRepoPath, "worktree", "remove", worktreePath, "--force"],
			{ env, timeout: 60_000 },
		);

		console.log(`Removed worktree at ${worktreePath}`);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`Failed to remove worktree: ${errorMessage}`);
		throw new Error(`Failed to remove worktree: ${errorMessage}`);
	}
}

/**
 * Gets the git repository root path.
 */
export async function getGitRoot(path: string): Promise<string> {
	try {
		const git = simpleGit(path);
		const root = await git.revparse(["--show-toplevel"]);
		return root.trim();
	} catch {
		throw new Error(`Not a git repository: ${path}`);
	}
}

/**
 * Checks if a worktree exists at the given path.
 */
export async function worktreeExists({
	mainRepoPath,
	worktreePath,
}: {
	mainRepoPath: string;
	worktreePath: string;
}): Promise<boolean> {
	try {
		const git = simpleGit(mainRepoPath);
		const worktrees = await git.raw(["worktree", "list", "--porcelain"]);

		const lines = worktrees.split("\n");
		const worktreePrefix = `worktree ${worktreePath}`;
		return lines.some((line) => line.trim() === worktreePrefix);
	} catch (error) {
		console.error(`Failed to check worktree existence: ${error}`);
		throw error;
	}
}

/**
 * Lists all worktrees for a repository.
 */
export async function listWorktrees(
	mainRepoPath: string,
): Promise<Array<{ path: string; branch: string | null }>> {
	try {
		const git = simpleGit(mainRepoPath);
		const output = await git.raw(["worktree", "list", "--porcelain"]);

		const worktrees: Array<{ path: string; branch: string | null }> = [];
		let currentPath: string | null = null;
		let currentBranch: string | null = null;

		for (const line of output.split("\n")) {
			if (line.startsWith("worktree ")) {
				if (currentPath) {
					worktrees.push({ path: currentPath, branch: currentBranch });
				}
				currentPath = line.slice(9);
				currentBranch = null;
			} else if (line.startsWith("branch ")) {
				currentBranch = line.slice(7).replace("refs/heads/", "");
			}
		}

		if (currentPath) {
			worktrees.push({ path: currentPath, branch: currentBranch });
		}

		return worktrees;
	} catch (error) {
		console.error(`Failed to list worktrees: ${error}`);
		throw error;
	}
}
