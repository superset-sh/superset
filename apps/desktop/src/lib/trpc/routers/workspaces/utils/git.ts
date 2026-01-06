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
 * Error thrown by execFile when the command fails.
 * `code` can be a number (exit code) or string (spawn error like "ENOENT").
 */
interface ExecFileException extends Error {
	code?: number | string;
	killed?: boolean;
	signal?: NodeJS.Signals;
	cmd?: string;
	stdout?: string;
	stderr?: string;
}

function isExecFileException(error: unknown): error is ExecFileException {
	return (
		error instanceof Error &&
		("code" in error || "signal" in error || "killed" in error)
	);
}

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

	// First check if we have an origin remote
	const hasRemote = await hasOriginRemote(mainRepoPath);

	if (hasRemote) {
		// Try to get the default branch from origin/HEAD
		try {
			const headRef = await git.raw([
				"symbolic-ref",
				"refs/remotes/origin/HEAD",
			]);
			const match = headRef.trim().match(/refs\/remotes\/origin\/(.+)/);
			if (match) return match[1];
		} catch {}

		// Check remote branches for common default branch names
		try {
			const branches = await git.branch(["-r"]);
			const remoteBranches = branches.all.map((b) => b.replace("origin/", ""));

			for (const candidate of ["main", "master", "develop", "trunk"]) {
				if (remoteBranches.includes(candidate)) {
					return candidate;
				}
			}
		} catch {}

		// Try ls-remote as last resort for remote repos
		try {
			const result = await git.raw(["ls-remote", "--symref", "origin", "HEAD"]);
			const symrefMatch = result.match(/ref:\s+refs\/heads\/(.+?)\tHEAD/);
			if (symrefMatch) {
				return symrefMatch[1];
			}
		} catch {}
	} else {
		// No remote - use the current local branch or check for common branch names
		try {
			const currentBranch = await getCurrentBranch(mainRepoPath);
			if (currentBranch) {
				return currentBranch;
			}
		} catch {}

		// Fallback: check for common default branch names locally
		try {
			const localBranches = await git.branchLocal();
			for (const candidate of ["main", "master", "develop", "trunk"]) {
				if (localBranches.all.includes(candidate)) {
					return candidate;
				}
			}
			// If we have any local branches, use the first one
			if (localBranches.all.length > 0) {
				return localBranches.all[0];
			}
		} catch {}
	}

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

/**
 * Refreshes the local origin/HEAD symref from the remote and returns the current default branch.
 * This detects when the remote repository's default branch has changed (e.g., master -> main).
 * @param mainRepoPath - Path to the main repository
 * @returns The current default branch name, or null if unable to determine
 */
export async function refreshDefaultBranch(
	mainRepoPath: string,
): Promise<string | null> {
	const git = simpleGit(mainRepoPath);

	const hasRemote = await hasOriginRemote(mainRepoPath);
	if (!hasRemote) {
		return null;
	}

	try {
		// Git doesn't auto-update origin/HEAD on fetch, so we must explicitly
		// sync it to detect when the remote's default branch changes
		await git.remote(["set-head", "origin", "--auto"]);

		const headRef = await git.raw(["symbolic-ref", "refs/remotes/origin/HEAD"]);
		const match = headRef.trim().match(/refs\/remotes\/origin\/(.+)/);
		if (match) {
			return match[1];
		}
	} catch {
		// set-head requires network access; fall back to ls-remote which may
		// work in some edge cases or provide a more specific error
		try {
			const result = await git.raw(["ls-remote", "--symref", "origin", "HEAD"]);
			const symrefMatch = result.match(/ref:\s+refs\/heads\/(.+?)\tHEAD/);
			if (symrefMatch) {
				return symrefMatch[1];
			}
		} catch {
			// Network unavailable - caller will use cached value
		}
	}

	return null;
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

export type BranchExistsResult =
	| { status: "exists" }
	| { status: "not_found" }
	| { status: "error"; message: string };

/**
 * Git exit codes for ls-remote --exit-code:
 * - 0: Refs found (branch exists)
 * - 2: No matching refs (branch doesn't exist)
 * - 128: Fatal error (auth, network, invalid repo, etc.)
 */
const GIT_EXIT_CODES = {
	SUCCESS: 0,
	NO_MATCHING_REFS: 2,
	FATAL_ERROR: 128,
} as const;

/**
 * Patterns for categorizing git fatal errors (exit code 128).
 * These are checked against lowercase error messages/stderr.
 */
const GIT_ERROR_PATTERNS = {
	network: [
		"could not resolve host",
		"unable to access",
		"connection refused",
		"network is unreachable",
		"timed out",
		"ssl",
		"could not read from remote",
	],
	auth: [
		"authentication",
		"permission denied",
		"403",
		"401",
		// SSH-specific auth failures
		"permission denied (publickey)",
		"host key verification failed",
	],
	remoteNotConfigured: [
		"does not appear to be a git repository",
		"no such remote",
		"repository not found",
		"remote origin not found",
	],
} as const;

function categorizeGitError(errorMessage: string): BranchExistsResult {
	const lowerMessage = errorMessage.toLowerCase();

	if (GIT_ERROR_PATTERNS.network.some((p) => lowerMessage.includes(p))) {
		return {
			status: "error",
			message: "Cannot connect to remote. Check your network connection.",
		};
	}

	if (GIT_ERROR_PATTERNS.auth.some((p) => lowerMessage.includes(p))) {
		return {
			status: "error",
			message: "Authentication failed. Check your Git credentials.",
		};
	}

	if (
		GIT_ERROR_PATTERNS.remoteNotConfigured.some((p) => lowerMessage.includes(p))
	) {
		return {
			status: "error",
			message:
				"Remote 'origin' is not configured or the repository was not found.",
		};
	}

	return {
		status: "error",
		message: `Failed to verify branch: ${errorMessage}`,
	};
}

export async function branchExistsOnRemote(
	worktreePath: string,
	branchName: string,
): Promise<BranchExistsResult> {
	const env = await getGitEnv();

	try {
		// Use execFileAsync directly to get reliable exit codes
		// simple-git doesn't expose exit codes in a predictable way
		await execFileAsync(
			"git",
			[
				"-C",
				worktreePath,
				"ls-remote",
				"--exit-code",
				"--heads",
				"origin",
				branchName,
			],
			{ env, timeout: 30_000 },
		);
		// Exit code 0 = branch exists (--exit-code flag ensures this)
		return { status: "exists" };
	} catch (error) {
		// Use type guard to safely access ExecFileException properties
		if (!isExecFileException(error)) {
			return {
				status: "error",
				message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
			};
		}

		// Handle spawn/system errors first (code is a string like "ENOENT")
		if (typeof error.code === "string") {
			if (error.code === "ENOENT") {
				return {
					status: "error",
					message: "Git is not installed or not found in PATH.",
				};
			}
			if (error.code === "ETIMEDOUT") {
				return {
					status: "error",
					message: "Git command timed out. Check your network connection.",
				};
			}
			// Other system errors
			return {
				status: "error",
				message: `System error: ${error.code}`,
			};
		}

		// Handle killed/timed out processes (timeout option triggers this)
		if (error.killed || error.signal) {
			return {
				status: "error",
				message: "Git command timed out. Check your network connection.",
			};
		}

		// Now code is numeric - it's a git exit code
		if (error.code === GIT_EXIT_CODES.NO_MATCHING_REFS) {
			return { status: "not_found" };
		}

		// For fatal errors (128) or other codes, categorize using stderr (preferred) or message
		// stderr contains the actual git error; message may include wrapper text
		const errorText = error.stderr || error.message || "";
		return categorizeGitError(errorText);
	}
}

/**
 * Detect which branch a worktree was likely based off of.
 * Uses merge-base to find the closest common ancestor with candidate base branches.
 */
export async function detectBaseBranch(
	worktreePath: string,
	currentBranch: string,
	defaultBranch: string,
): Promise<string | null> {
	const git = simpleGit(worktreePath);

	// Candidate base branches to check, in priority order
	const candidates = [
		defaultBranch,
		"main",
		"master",
		"develop",
		"development",
	].filter((b, i, arr) => arr.indexOf(b) === i); // dedupe

	let bestCandidate: string | null = null;
	let bestAheadCount = Number.POSITIVE_INFINITY;

	for (const candidate of candidates) {
		// Skip if this is the current branch
		if (candidate === currentBranch) continue;

		try {
			// Check if the remote branch exists
			const remoteBranch = `origin/${candidate}`;
			await git.raw(["rev-parse", "--verify", remoteBranch]);

			// Count how many commits the current branch is ahead of the merge-base
			// The branch with the fewest commits "ahead" is likely the base
			const mergeBase = await git.raw(["merge-base", "HEAD", remoteBranch]);
			const aheadCount = await git.raw([
				"rev-list",
				"--count",
				`${mergeBase.trim()}..HEAD`,
			]);

			const count = Number.parseInt(aheadCount.trim(), 10);
			if (count < bestAheadCount) {
				bestAheadCount = count;
				bestCandidate = candidate;
			}
		} catch {}
	}

	return bestCandidate;
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
		const status = await git.status();

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

		// Block on untracked files as they could be overwritten by checkout
		if (hasUntrackedFiles) {
			return {
				safe: false,
				error:
					"Cannot switch branches: you have untracked files that may be overwritten. Please commit, stash, or remove them first.",
				hasUncommittedChanges: false,
				hasUntrackedFiles: true,
			};
		}

		// Fetch and prune stale remote refs (best-effort, ignore errors if offline)
		try {
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
/**
 * Checks if a git ref exists locally (without network access).
 * Uses --verify --quiet to only check exit code without output.
 * @param repoPath - Path to the repository
 * @param ref - The ref to check (e.g., "main", "origin/main")
 * @returns true if the ref exists locally, false otherwise
 */
export async function refExistsLocally(
	repoPath: string,
	ref: string,
): Promise<boolean> {
	const git = simpleGit(repoPath);
	try {
		// Use --verify --quiet to check if ref exists without output
		// Append ^{commit} to ensure it resolves to a commit-ish
		await git.raw(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
		return true;
	} catch {
		return false;
	}
}

/**
 * Sanitizes git error messages for user display.
 * Strips "fatal:" prefixes, excessive newlines, and other git plumbing text.
 * @param message - Raw git error message
 * @returns Cleaned message suitable for UI display
 */
export function sanitizeGitError(message: string): string {
	return message
		.replace(/^fatal:\s*/i, "")
		.replace(/^error:\s*/i, "")
		.replace(/\n+/g, " ")
		.trim();
}

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
