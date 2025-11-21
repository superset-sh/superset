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
): Promise<void> {
	try {
		const parentDir = join(worktreePath, "..");
		await mkdir(parentDir, { recursive: true });

		const git = simpleGit(mainRepoPath);
		await git.raw(["worktree", "add", worktreePath, "-b", branch]);

		console.log(`Created worktree at ${worktreePath} with branch ${branch}`);
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
	} catch (error) {
		throw new Error(`Not a git repository: ${path}`);
	}
}
