import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import simpleGit from "simple-git";
import {
	adjectives,
	animals,
	uniqueNamesGenerator,
} from "unique-names-generator";
import { checkGitLfsAvailable, getShellEnvironment } from "./shell-env";

const execFileAsync = promisify(execFile);

/**
 * Builds the merged environment for git operations.
 * Takes process.env as base, then overrides only PATH from shell environment.
 * This preserves runtime vars (git credentials, proxy, ELECTRON_*, etc.)
 * while picking up PATH modifications from shell profiles (e.g., homebrew git-lfs).
 */
async function getGitEnv(): Promise<Record<string, string>> {
	const shellEnv = await getShellEnvironment();
	const result: Record<string, string> = {};

	// Start with process.env as base
	for (const [key, value] of Object.entries(process.env)) {
		if (typeof value === "string") {
			result[key] = value;
		}
	}

	// Only override PATH from shell env (use platform-appropriate key)
	const pathKey = process.platform === "win32" ? "Path" : "PATH";
	if (shellEnv[pathKey]) {
		result[pathKey] = shellEnv[pathKey];
	}

	return result;
}

/**
 * Checks if a repository uses Git LFS using a hybrid approach:
 * 1. Fast path: check if .git/lfs directory exists (LFS already initialized)
 * 2. Check multiple attribute sources for filter=lfs:
 *    - Root .gitattributes
 *    - .git/info/attributes (local overrides)
 *    - .lfsconfig (LFS-specific config)
 * 3. Final fallback: check git config for LFS filter (catches nested .gitattributes)
 */
async function repoUsesLfs(repoPath: string): Promise<boolean> {
	// Fast path: .git/lfs exists when LFS is initialized or objects fetched
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

	// Check multiple attribute sources for filter=lfs
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

	// Final fallback: sample a few tracked files with git check-attr
	// This catches nested .gitattributes that declare filter=lfs
	try {
		const git = simpleGit(repoPath);
		// Get a small sample of tracked files (limit to 20 for performance)
		const lsFiles = await git.raw(["ls-files"]);
		const sampleFiles = lsFiles.split("\n").filter(Boolean).slice(0, 20);

		if (sampleFiles.length > 0) {
			// Check filter attribute on sampled files
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
		// If git commands fail, assume no LFS to avoid blocking
	}

	return false;
}

function isEnoent(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	);
}

export function generateBranchName(): string {
	const name = uniqueNamesGenerator({
		dictionaries: [adjectives, animals],
		separator: "-",
		length: 2,
		style: "lowerCase",
	});
	const suffix = randomBytes(3).toString("hex");

	return `${name}-${suffix}`;
}

export async function createWorktree(
	mainRepoPath: string,
	branch: string,
	worktreePath: string,
	startPoint = "origin/main",
): Promise<void> {
	// Check LFS usage before try block so it's available in catch for error messaging
	const usesLfs = await repoUsesLfs(mainRepoPath);

	try {
		const parentDir = join(worktreePath, "..");
		await mkdir(parentDir, { recursive: true });

		// Get merged environment (process.env + shell env for PATH)
		const env = await getGitEnv();

		// Proactive LFS check: detect early if repo uses LFS but git-lfs is missing
		if (usesLfs) {
			const lfsAvailable = await checkGitLfsAvailable(env);
			if (!lfsAvailable) {
				throw new Error(
					`This repository uses Git LFS, but git-lfs was not found. ` +
						`Please install git-lfs (e.g., 'brew install git-lfs') and run 'git lfs install'.`,
				);
			}
		}

		// Use execFile with arg array for proper POSIX compatibility (no shell escaping needed)
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
				startPoint,
			],
			{ env, timeout: 120_000 },
		);

		console.log(
			`Created worktree at ${worktreePath} with branch ${branch} from ${startPoint}`,
		);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const lowerError = errorMessage.toLowerCase();

		// Check for git lock file errors (e.g., .git/config.lock, .git/index.lock)
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

		// Broad check for LFS-related errors:
		// - "git-lfs" / "filter-process" (original)
		// - "smudge filter" (more specific than just "smudge" to avoid false positives)
		// - "git: 'lfs' is not a git command"
		// - Any mention of "lfs" when we detected LFS usage
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

export async function removeWorktree(
	mainRepoPath: string,
	worktreePath: string,
): Promise<void> {
	try {
		// Get merged environment (process.env + shell env for PATH)
		const env = await getGitEnv();

		// Use execFile with arg array for proper POSIX compatibility
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

export async function getGitRoot(path: string): Promise<string> {
	try {
		const git = simpleGit(path);
		const root = await git.revparse(["--show-toplevel"]);
		return root.trim();
	} catch (_error) {
		throw new Error(`Not a git repository: ${path}`);
	}
}

/**
 * Checks if a worktree exists in git's worktree list
 * @param mainRepoPath - Path to the main repository
 * @param worktreePath - Path to the worktree to check
 * @returns true if the worktree exists in git, false otherwise
 */
export async function worktreeExists(
	mainRepoPath: string,
	worktreePath: string,
): Promise<boolean> {
	try {
		const git = simpleGit(mainRepoPath);
		const worktrees = await git.raw(["worktree", "list", "--porcelain"]);

		// Parse porcelain format to verify worktree exists
		// Format: "worktree /path/to/worktree" followed by HEAD, branch, etc.
		const lines = worktrees.split("\n");
		const worktreePrefix = `worktree ${worktreePath}`;
		return lines.some((line) => line.trim() === worktreePrefix);
	} catch (error) {
		console.error(`Failed to check worktree existence: ${error}`);
		throw error;
	}
}

/**
 * Checks if the repository has an 'origin' remote configured
 */
export async function hasOriginRemote(mainRepoPath: string): Promise<boolean> {
	try {
		const git = simpleGit(mainRepoPath);
		const remotes = await git.getRemotes();
		return remotes.some((r) => r.name === "origin");
	} catch {
		return false;
	}
}

/**
 * Detects the default branch of a repository by checking:
 * 1. Remote HEAD reference (origin/HEAD -> origin/main or origin/master)
 * 2. Common branch names (main, master, develop, trunk)
 * 3. Fallback to 'main'
 */
export async function getDefaultBranch(mainRepoPath: string): Promise<string> {
	const git = simpleGit(mainRepoPath);

	// Method 1: Check origin/HEAD symbolic ref
	try {
		const headRef = await git.raw(["symbolic-ref", "refs/remotes/origin/HEAD"]);
		// Returns something like 'refs/remotes/origin/main'
		const match = headRef.trim().match(/refs\/remotes\/origin\/(.+)/);
		if (match) return match[1];
	} catch {
		// origin/HEAD not set, continue to fallback
	}

	// Method 2: Check which common branches exist on remote
	try {
		const branches = await git.branch(["-r"]);
		const remoteBranches = branches.all.map((b) => b.replace("origin/", ""));

		for (const candidate of ["main", "master", "develop", "trunk"]) {
			if (remoteBranches.includes(candidate)) {
				return candidate;
			}
		}
	} catch {
		// Failed to list branches
	}

	// Fallback
	return "main";
}

/**
 * Fetches the default branch from origin and returns the latest commit SHA
 * @param mainRepoPath - Path to the main repository
 * @param defaultBranch - The default branch name (e.g., 'main', 'master')
 * @returns The commit SHA of origin/{defaultBranch} after fetch
 */
export async function fetchDefaultBranch(
	mainRepoPath: string,
	defaultBranch: string,
): Promise<string> {
	const git = simpleGit(mainRepoPath);
	await git.fetch("origin", defaultBranch);
	const commit = await git.revparse(`origin/${defaultBranch}`);
	return commit.trim();
}

/**
 * Checks if a worktree's branch is behind the default branch
 * @param worktreePath - Path to the worktree
 * @param defaultBranch - The default branch name (e.g., 'main', 'master')
 * @returns true if the branch has commits on origin/{defaultBranch} that it doesn't have
 */
export async function checkNeedsRebase(
	worktreePath: string,
	defaultBranch: string,
): Promise<boolean> {
	const git = simpleGit(worktreePath);
	const behindCount = await git.raw([
		"rev-list",
		"--count",
		`HEAD..origin/${defaultBranch}`,
	]);
	return Number.parseInt(behindCount.trim(), 10) > 0;
}

/**
 * Checks if a worktree has uncommitted changes (staged, unstaged, or untracked files)
 * @param worktreePath - Path to the worktree
 * @returns true if there are any uncommitted changes
 */
export async function hasUncommittedChanges(
	worktreePath: string,
): Promise<boolean> {
	const git = simpleGit(worktreePath);
	const status = await git.status();
	return !status.isClean();
}

/**
 * Checks if a worktree has commits that haven't been pushed to the remote
 * @param worktreePath - Path to the worktree
 * @returns true if there are unpushed commits, false if all commits are pushed or no upstream exists
 */
export async function hasUnpushedCommits(
	worktreePath: string,
): Promise<boolean> {
	const git = simpleGit(worktreePath);
	try {
		// Count commits that are on HEAD but not on the upstream tracking branch
		// @{upstream} refers to the configured upstream branch (e.g., origin/branch-name)
		const aheadCount = await git.raw([
			"rev-list",
			"--count",
			"@{upstream}..HEAD",
		]);
		return Number.parseInt(aheadCount.trim(), 10) > 0;
	} catch {
		// No upstream configured or other error - check if any commits exist at all
		// that aren't on origin (for branches without tracking)
		try {
			// If there's no upstream, check if branch has commits not on any remote
			const localCommits = await git.raw([
				"rev-list",
				"--count",
				"HEAD",
				"--not",
				"--remotes",
			]);
			return Number.parseInt(localCommits.trim(), 10) > 0;
		} catch {
			// If all else fails, assume no unpushed commits
			return false;
		}
	}
}

/**
 * Checks if a branch exists on the remote (origin) by querying the remote directly.
 * Uses `git ls-remote` to check the actual remote state, not just locally fetched refs.
 * @param worktreePath - Path to the worktree
 * @param branchName - The branch name to check
 * @returns true if the branch exists on origin
 */
export async function branchExistsOnRemote(
	worktreePath: string,
	branchName: string,
): Promise<boolean> {
	const git = simpleGit(worktreePath);
	try {
		// Use ls-remote to check actual remote state (not just local refs)
		const result = await git.raw([
			"ls-remote",
			"--exit-code",
			"--heads",
			"origin",
			branchName,
		]);
		// If we get output, the branch exists
		return result.trim().length > 0;
	} catch {
		// --exit-code makes git return non-zero if no matching refs found
		return false;
	}
}
