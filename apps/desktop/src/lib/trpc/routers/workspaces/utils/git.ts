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

async function getGitEnv(): Promise<Record<string, string>> {
	const shellEnv = await getShellEnvironment();
	const result: Record<string, string> = {};

	for (const [key, value] of Object.entries(process.env)) {
		if (typeof value === "string") {
			result[key] = value;
		}
	}

	const pathKey = process.platform === "win32" ? "Path" : "PATH";
	if (shellEnv[pathKey]) {
		result[pathKey] = shellEnv[pathKey];
	}

	return result;
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
	} catch {}

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

export async function removeWorktree(
	mainRepoPath: string,
	worktreePath: string,
): Promise<void> {
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

export async function getGitRoot(path: string): Promise<string> {
	try {
		const git = simpleGit(path);
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

export async function hasOriginRemote(mainRepoPath: string): Promise<boolean> {
	try {
		const git = simpleGit(mainRepoPath);
		const remotes = await git.getRemotes();
		return remotes.some((r) => r.name === "origin");
	} catch {
		return false;
	}
}

export async function getDefaultBranch(mainRepoPath: string): Promise<string> {
	const git = simpleGit(mainRepoPath);

	try {
		const headRef = await git.raw(["symbolic-ref", "refs/remotes/origin/HEAD"]);
		const match = headRef.trim().match(/refs\/remotes\/origin\/(.+)/);
		if (match) return match[1];
	} catch {}

	try {
		const branches = await git.branch(["-r"]);
		const remoteBranches = branches.all.map((b) => b.replace("origin/", ""));

		for (const candidate of ["main", "master", "develop", "trunk"]) {
			if (remoteBranches.includes(candidate)) {
				return candidate;
			}
		}
	} catch {}

	try {
		const hasRemote = await hasOriginRemote(mainRepoPath);
		if (hasRemote) {
			const result = await git.raw(["ls-remote", "--symref", "origin", "HEAD"]);
			const symrefMatch = result.match(/ref:\s+refs\/heads\/(.+?)\tHEAD/);
			if (symrefMatch) {
				return symrefMatch[1];
			}
		}
	} catch {}

	return "main";
}

export async function fetchDefaultBranch(
	mainRepoPath: string,
	defaultBranch: string,
): Promise<string> {
	const git = simpleGit(mainRepoPath);
	await git.fetch("origin", defaultBranch);
	const commit = await git.revparse(`origin/${defaultBranch}`);
	return commit.trim();
}

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

export async function hasUncommittedChanges(
	worktreePath: string,
): Promise<boolean> {
	const git = simpleGit(worktreePath);
	const status = await git.status();
	return !status.isClean();
}

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

/**
 * Lists all local and remote branches in a repository
 * @param repoPath - Path to the repository
 * @param options.fetch - Whether to fetch and prune remote refs first (default: false)
 * @returns Object with local and remote branch arrays
 */
export async function listBranches(
	repoPath: string,
	options?: { fetch?: boolean },
): Promise<{ local: string[]; remote: string[] }> {
	const git = simpleGit(repoPath);

	// Optionally fetch and prune to get up-to-date remote refs
	if (options?.fetch) {
		try {
			await git.fetch(["--prune"]);
		} catch {
			// Ignore fetch errors (e.g., offline)
		}
	}

	// Get local branches
	const localResult = await git.branchLocal();
	const local = localResult.all;

	// Get remote branches (strip "origin/" prefix)
	const remoteResult = await git.branch(["-r"]);
	const remote = remoteResult.all
		.filter((b) => b.startsWith("origin/") && !b.includes("->"))
		.map((b) => b.replace("origin/", ""));

	return { local, remote };
}

/**
 * Gets the current branch name (HEAD)
 * @param repoPath - Path to the repository
 * @returns The current branch name, or null if in detached HEAD state
 */
export async function getCurrentBranch(
	repoPath: string,
): Promise<string | null> {
	const git = simpleGit(repoPath);
	try {
		const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
		const trimmed = branch.trim();
		// "HEAD" means detached HEAD state
		return trimmed === "HEAD" ? null : trimmed;
	} catch {
		return null;
	}
}

/**
 * Result of pre-checkout safety checks
 */
export interface CheckoutSafetyResult {
	safe: boolean;
	error?: string;
	hasUncommittedChanges?: boolean;
	hasUntrackedFiles?: boolean;
}

/**
 * Performs safety checks before a branch checkout:
 * 1. Checks for uncommitted changes (staged/unstaged/created/renamed)
 * 2. Checks for untracked files that might be overwritten
 * 3. Runs git fetch --prune to clean up stale remote refs
 * @param repoPath - Path to the repository
 * @returns Safety check result indicating if checkout is safe
 */
export async function checkBranchCheckoutSafety(
	repoPath: string,
): Promise<CheckoutSafetyResult> {
	const git = simpleGit(repoPath);

	try {
		// Check for uncommitted changes
		const status = await git.status();

		// Check all forms of uncommitted changes:
		// - staged: files added to index
		// - modified: tracked files with unstaged changes
		// - deleted: tracked files deleted but not staged
		// - created: new files staged for commit
		// - renamed: files renamed (staged)
		// - conflicted: merge conflicts
		const hasUncommittedChanges =
			status.staged.length > 0 ||
			status.modified.length > 0 ||
			status.deleted.length > 0 ||
			status.created.length > 0 ||
			status.renamed.length > 0 ||
			status.conflicted.length > 0;

		// Untracked files that could be overwritten by checkout
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

		// Block on untracked files as they could be overwritten
		if (hasUntrackedFiles) {
			return {
				safe: false,
				error:
					"Cannot switch branches: you have untracked files that may be overwritten. Please commit, stash, or remove them first.",
				hasUncommittedChanges: false,
				hasUntrackedFiles: true,
			};
		}

		// Fetch and prune stale remote refs (best-effort)
		try {
			await git.fetch(["--prune"]);
		} catch {
			// Ignore fetch errors (e.g., offline) - not critical for safety
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
 * Checks out a branch in a repository.
 * If the branch only exists on remote, creates a local tracking branch.
 * @param repoPath - Path to the repository
 * @param branch - The branch name to checkout
 */
export async function checkoutBranch(
	repoPath: string,
	branch: string,
): Promise<void> {
	const git = simpleGit(repoPath);

	// Check if branch exists locally
	const localBranches = await git.branchLocal();
	if (localBranches.all.includes(branch)) {
		await git.checkout(branch);
		return;
	}

	// Branch doesn't exist locally - check if it exists on remote and create tracking branch
	const remoteBranches = await git.branch(["-r"]);
	const remoteBranchName = `origin/${branch}`;
	if (remoteBranches.all.includes(remoteBranchName)) {
		// Create local branch tracking the remote
		await git.checkout(["-b", branch, "--track", remoteBranchName]);
		return;
	}

	// Branch doesn't exist anywhere - let git checkout fail with its normal error
	await git.checkout(branch);
}

/**
 * Safe branch checkout that performs safety checks first.
 * This is the preferred method for branch workspaces.
 * @param repoPath - Path to the repository
 * @param branch - Branch to checkout
 * @throws Error if safety checks fail or checkout fails
 */
export async function safeCheckoutBranch(
	repoPath: string,
	branch: string,
): Promise<void> {
	// Check if we're already on the target branch - no checkout needed
	const currentBranch = await getCurrentBranch(repoPath);
	if (currentBranch === branch) {
		return;
	}

	// Run safety checks before switching branches
	const safety = await checkBranchCheckoutSafety(repoPath);
	if (!safety.safe) {
		throw new Error(safety.error);
	}

	// Proceed with checkout
	await checkoutBranch(repoPath, branch);

	// Verify we landed on the correct branch
	const verifyBranch = await getCurrentBranch(repoPath);
	if (verifyBranch !== branch) {
		throw new Error(
			`Branch checkout verification failed: expected "${branch}" but HEAD is on "${verifyBranch ?? "detached HEAD"}"`,
		);
	}
}
