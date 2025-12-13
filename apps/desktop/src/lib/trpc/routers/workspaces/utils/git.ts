import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { getGitBinaryPath } from "main/lib/git-binary";
import simpleGit from "simple-git";
import {
	adjectives,
	animals,
	uniqueNamesGenerator,
} from "unique-names-generator";

const execFileAsync = promisify(execFile);

/**
 * Creates a simpleGit instance configured to use the bundled git binary.
 * This avoids dependency on system git (no Xcode license issues on macOS, etc.)
 */
function createGit(baseDir: string) {
	return simpleGit({ baseDir, binary: getGitBinaryPath() });
}

/**
 * Checks if a repository uses Git LFS.
 * Used for better error messaging when LFS operations fail.
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
	try {
		const git = createGit(repoPath);
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
	// Check LFS usage for better error messaging
	const usesLfs = await repoUsesLfs(mainRepoPath);

	try {
		const parentDir = join(worktreePath, "..");
		await mkdir(parentDir, { recursive: true });

		await execFileAsync(
			getGitBinaryPath(),
			["-C", mainRepoPath, "worktree", "add", worktreePath, "-b", branch, startPoint],
			{ timeout: 120_000 },
		);

		console.log(
			`Created worktree at ${worktreePath} with branch ${branch} from ${startPoint}`,
		);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const lowerError = errorMessage.toLowerCase();

		// Check for git lock file errors
		if (
			lowerError.includes("could not lock") ||
			lowerError.includes("unable to lock") ||
			(lowerError.includes(".lock") && lowerError.includes("file exists"))
		) {
			throw new Error(
				`Failed to create worktree: The git repository is locked by another process. ` +
					`Please wait for the other operation to complete, or manually remove the lock file ` +
					`(e.g., .git/config.lock or .git/index.lock) if you're sure no git operations are running.`,
			);
		}

		// Check for LFS-related errors
		const isLfsError =
			lowerError.includes("git-lfs") ||
			lowerError.includes("filter-process") ||
			lowerError.includes("smudge filter") ||
			(lowerError.includes("lfs") && usesLfs);

		if (isLfsError) {
			throw new Error(
				`Failed to create worktree: Git LFS operation failed. ` +
					`This repository uses Git LFS for large files. Error: ${errorMessage}`,
			);
		}

		throw new Error(`Failed to create worktree: ${errorMessage}`);
	}
}

export async function removeWorktree(
	mainRepoPath: string,
	worktreePath: string,
): Promise<void> {
	try {
		await execFileAsync(
			getGitBinaryPath(),
			["-C", mainRepoPath, "worktree", "remove", worktreePath, "--force"],
			{ timeout: 60_000 },
		);

		console.log(`Removed worktree at ${worktreePath}`);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to remove worktree: ${errorMessage}`);
	}
}

export async function getGitRoot(path: string): Promise<string> {
	try {
		const git = createGit(path);
		const root = await git.revparse(["--show-toplevel"]);
		return root.trim();
	} catch (_error) {
		throw new Error(`Not a git repository: ${path}`);
	}
}

export async function worktreeExists(
	mainRepoPath: string,
	worktreePath: string,
): Promise<boolean> {
	try {
		const git = createGit(mainRepoPath);
		const worktrees = await git.raw(["worktree", "list", "--porcelain"]);
		const lines = worktrees.split("\n");
		const worktreePrefix = `worktree ${worktreePath}`;
		return lines.some((line) => line.trim() === worktreePrefix);
	} catch (error) {
		console.error(`Failed to check worktree existence: ${error}`);
		throw error;
	}
}

export async function hasOriginRemote(mainRepoPath: string): Promise<boolean> {
	try {
		const git = createGit(mainRepoPath);
		const remotes = await git.getRemotes();
		return remotes.some((r) => r.name === "origin");
	} catch {
		return false;
	}
}

export async function getDefaultBranch(mainRepoPath: string): Promise<string> {
	const git = createGit(mainRepoPath);

	// Method 1: Check origin/HEAD symbolic ref
	try {
		const headRef = await git.raw(["symbolic-ref", "refs/remotes/origin/HEAD"]);
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

	return "main";
}

export async function fetchDefaultBranch(
	mainRepoPath: string,
	defaultBranch: string,
): Promise<string> {
	const git = createGit(mainRepoPath);
	await git.fetch("origin", defaultBranch);
	const commit = await git.revparse(`origin/${defaultBranch}`);
	return commit.trim();
}

export async function checkNeedsRebase(
	worktreePath: string,
	defaultBranch: string,
): Promise<boolean> {
	const git = createGit(worktreePath);
	const behindCount = await git.raw([
		"rev-list",
		"--count",
		`HEAD..origin/${defaultBranch}`,
	]);
	return Number.parseInt(behindCount.trim(), 10) > 0;
}

export async function hasUncommittedChanges(
	worktreePath: string,
): Promise<boolean> {
	const git = createGit(worktreePath);
	const status = await git.status();
	return !status.isClean();
}

export async function hasUnpushedCommits(
	worktreePath: string,
): Promise<boolean> {
	const git = createGit(worktreePath);
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

export async function branchExistsOnRemote(
	worktreePath: string,
	branchName: string,
): Promise<boolean> {
	const git = createGit(worktreePath);
	try {
		const result = await git.raw([
			"ls-remote",
			"--exit-code",
			"--heads",
			"origin",
			branchName,
		]);
		return result.trim().length > 0;
	} catch {
		return false;
	}
}
