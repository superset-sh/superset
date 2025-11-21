import { exec } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";

const execAsync = promisify(exec);

/**
 * Generate a random branch name using adjective-noun-number pattern
 * Examples: "ws-crimson-forest-42", "ws-azure-cloud-17"
 */
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

/**
 * Create a new git worktree
 * @param mainRepoPath - Path to the main git repository
 * @param branch - Branch name for the worktree
 * @param worktreePath - Path where the worktree should be created
 */
export async function createWorktree(
	mainRepoPath: string,
	branch: string,
	worktreePath: string,
): Promise<void> {
	try {
		// Ensure the parent directory exists
		const parentDir = join(worktreePath, "..");
		await mkdir(parentDir, { recursive: true });

		// Create the worktree with a new branch
		await execAsync(`git worktree add "${worktreePath}" -b "${branch}"`, {
			cwd: mainRepoPath,
		});

		console.log(`Created worktree at ${worktreePath} with branch ${branch}`);
	} catch (error) {
		console.error(`Failed to create worktree: ${error}`);
		throw new Error(`Failed to create worktree: ${error}`);
	}
}

/**
 * Remove a git worktree
 * @param mainRepoPath - Path to the main git repository
 * @param worktreePath - Path to the worktree to remove
 */
export async function removeWorktree(
	mainRepoPath: string,
	worktreePath: string,
): Promise<void> {
	try {
		// Remove the worktree (--force removes even if there are uncommitted changes)
		await execAsync(`git worktree remove "${worktreePath}" --force`, {
			cwd: mainRepoPath,
		});

		console.log(`Removed worktree at ${worktreePath}`);
	} catch (error) {
		console.error(`Failed to remove worktree: ${error}`);
		throw new Error(`Failed to remove worktree: ${error}`);
	}
}

/**
 * Check if a path is a git repository
 * @param path - Path to check
 * @returns true if the path is a git repository
 */
export async function isGitRepo(path: string): Promise<boolean> {
	try {
		await execAsync("git rev-parse --git-dir", { cwd: path });
		return true;
	} catch {
		return false;
	}
}
