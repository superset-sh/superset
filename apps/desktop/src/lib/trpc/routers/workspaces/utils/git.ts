import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import simpleGit from "simple-git";
import {
	adjectives,
	animals,
	uniqueNamesGenerator,
} from "unique-names-generator";

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

		const git = simpleGit(mainRepoPath);
		await git.raw(["worktree", "add", worktreePath, "-b", branch, startPoint]);

		console.log(
			`Created worktree at ${worktreePath} with branch ${branch} from ${startPoint}`,
		);
	} catch (error) {
		console.error(`Failed to create worktree: ${error}`);
		throw new Error(`Failed to create worktree: ${error}`);
	}
}

export async function removeWorktree(
	mainRepoPath: string,
	worktreePath: string,
): Promise<void> {
	try {
		const git = simpleGit(mainRepoPath);
		await git.raw(["worktree", "remove", worktreePath, "--force"]);

		console.log(`Removed worktree at ${worktreePath}`);
	} catch (error) {
		console.error(`Failed to remove worktree: ${error}`);
		throw new Error(`Failed to remove worktree: ${error}`);
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
