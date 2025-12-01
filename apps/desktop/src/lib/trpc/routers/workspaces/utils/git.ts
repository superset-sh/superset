import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import simpleGit from "simple-git";

export function generateBranchName(): string {
	const adjectives = [
		"azure",
		"crimson",
		"emerald",
		"golden",
		"indigo",
		"jade",
		"lavender",
		"magenta",
		"navy",
		"olive",
		"pearl",
		"rose",
		"silver",
		"teal",
		"violet",
	];

	const nouns = [
		"cloud",
		"forest",
		"mountain",
		"ocean",
		"river",
		"storm",
		"sunset",
		"thunder",
		"wave",
		"wind",
		"meadow",
		"canyon",
		"glacier",
		"valley",
		"peak",
	];

	const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
	const noun = nouns[Math.floor(Math.random() * nouns.length)];
	const number = Math.floor(Math.random() * 100);

	return `${adjective}-${noun}-${number}`;
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
 * Fetches origin/main and returns the latest commit SHA
 * @param mainRepoPath - Path to the main repository
 * @returns The commit SHA of origin/main after fetch
 */
export async function fetchOriginMain(mainRepoPath: string): Promise<string> {
	const git = simpleGit(mainRepoPath);
	await git.fetch("origin", "main");
	const commit = await git.revparse("origin/main");
	return commit.trim();
}

/**
 * Checks if a worktree's branch is behind origin/main
 * @param worktreePath - Path to the worktree
 * @returns true if the branch has commits on origin/main that it doesn't have
 */
export async function checkNeedsRebase(worktreePath: string): Promise<boolean> {
	const git = simpleGit(worktreePath);
	const behindCount = await git.raw([
		"rev-list",
		"--count",
		"HEAD..origin/main",
	]);
	return Number.parseInt(behindCount.trim(), 10) > 0;
}
