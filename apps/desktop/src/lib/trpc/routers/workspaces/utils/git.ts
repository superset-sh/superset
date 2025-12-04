import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
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
 * Merges process.env with shell environment so that:
 * - Runtime vars (git credentials, proxy, etc.) from process.env are preserved
 * - PATH from shell environment picks up tools like git-lfs from homebrew
 */
async function getGitEnv(): Promise<Record<string, string>> {
	const shellEnv = await getShellEnvironment();
	const baseEnv: Record<string, string> = {};

	// Convert process.env to Record<string, string>
	for (const [key, value] of Object.entries(process.env)) {
		if (typeof value === "string") {
			baseEnv[key] = value;
		}
	}

	// Shell env wins for PATH, but base env preserved for everything else
	return { ...baseEnv, ...shellEnv };
}

/**
 * Checks if a repository uses Git LFS using a hybrid approach:
 * 1. Fast path: check if .git/lfs directory exists (LFS already initialized)
 * 2. Fallback: check root .gitattributes for filter=lfs (fresh clone, LFS not yet installed)
 */
async function repoUsesLfs(repoPath: string): Promise<boolean> {
	const { readFile, stat } = await import("node:fs/promises");

	// Fast path: .git/lfs exists when LFS is initialized or objects fetched
	try {
		const lfsDir = join(repoPath, ".git", "lfs");
		const stats = await stat(lfsDir);
		if (stats.isDirectory()) {
			return true;
		}
	} catch (error) {
		if (!isEnoent(error)) {
			// Permission/mount error on .git/lfs check - log but continue to fallback
			console.warn(`[git] Could not check .git/lfs directory: ${error}`);
		}
	}

	// Fallback: check root .gitattributes for filter=lfs
	// Catches fresh clones where LFS isn't initialized yet
	try {
		const gitattributes = await readFile(
			join(repoPath, ".gitattributes"),
			"utf-8",
		);
		return gitattributes.includes("filter=lfs");
	} catch (error) {
		if (isEnoent(error)) {
			// No .gitattributes at root - likely no LFS
			return false;
		}
		// Permission/mount error reading .gitattributes
		// Log and return false; if LFS is actually needed, git will fail with real error
		console.warn(`[git] Could not read .gitattributes: ${error}`);
		return false;
	}
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
	try {
		const parentDir = join(worktreePath, "..");
		await mkdir(parentDir, { recursive: true });

		// Get merged environment (process.env + shell env for PATH)
		const env = await getGitEnv();

		// Proactive LFS check: detect early if repo uses LFS but git-lfs is missing
		const usesLfs = await repoUsesLfs(mainRepoPath);
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

		// Check for git-lfs specific error and provide helpful message
		if (
			errorMessage.includes("git-lfs") ||
			errorMessage.includes("filter-process")
		) {
			console.error(`Git LFS error during worktree creation: ${errorMessage}`);
			throw new Error(
				`Failed to create worktree: This repository uses Git LFS, but git-lfs was not found. ` +
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
