/// <reference path="./friendly-words.d.ts" />
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import * as friendlyWords from "friendly-words";
import simpleGit from "simple-git";

import { getGitEnv } from "./shell-env";
import type { BranchExistsResult, ExecFileException } from "./types";

const execFileAsync = promisify(execFile);

/** Maximum attempts to find a unique word before falling back to suffixed names */
const MAX_ATTEMPTS = 10;
/** Maximum suffix value to try in fallback (exclusive), e.g., 0-99 */
const FALLBACK_MAX_SUFFIX = 100;

function isExecFileException(error: unknown): error is ExecFileException {
	return (
		error instanceof Error &&
		("code" in error || "signal" in error || "killed" in error)
	);
}

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

/**
 * Generates a random branch name using a single friendly word.
 * Checks against existing branches to avoid collisions.
 */
export function generateBranchName(existingBranches: string[] = []): string {
	const words = friendlyWords.objects as string[];
	const existingSet = new Set(existingBranches.map((b) => b.toLowerCase()));

	// Try to find a unique word
	for (let i = 0; i < MAX_ATTEMPTS; i++) {
		const word = words[Math.floor(Math.random() * words.length)];
		if (word && !existingSet.has(word.toLowerCase())) {
			return word;
		}
	}

	// Fallback: try word with numeric suffix
	const baseWord = words[Math.floor(Math.random() * words.length)] ?? "branch";
	for (let n = 0; n < FALLBACK_MAX_SUFFIX; n++) {
		const candidate = `${baseWord}-${n}`;
		if (!existingSet.has(candidate.toLowerCase())) {
			return candidate;
		}
	}

	// Final fallback: use timestamp to guarantee uniqueness
	return `${baseWord}-${Date.now()}`;
}

/**
 * Checks if the repository has an origin remote configured.
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
 * Gets the default branch for a repository.
 */
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
			if (match?.[1]) return match[1];
		} catch {
			// Ignore
		}

		// Check remote branches for common default branch names
		try {
			const branches = await git.branch(["-r"]);
			const remoteBranches = branches.all.map((b) => b.replace("origin/", ""));

			for (const candidate of ["main", "master", "develop", "trunk"]) {
				if (remoteBranches.includes(candidate)) {
					return candidate;
				}
			}
		} catch {
			// Ignore
		}

		// Try ls-remote as last resort for remote repos
		try {
			const result = await git.raw(["ls-remote", "--symref", "origin", "HEAD"]);
			const symrefMatch = result.match(/ref:\s+refs\/heads\/(.+?)\tHEAD/);
			if (symrefMatch?.[1]) {
				return symrefMatch[1];
			}
		} catch {
			// Ignore
		}
	} else {
		// No remote - use the current local branch or check for common branch names
		try {
			const currentBranch = await getCurrentBranch(mainRepoPath);
			if (currentBranch) {
				return currentBranch;
			}
		} catch {
			// Ignore
		}

		// Fallback: check for common default branch names locally
		try {
			const localBranches = await git.branchLocal();
			for (const candidate of ["main", "master", "develop", "trunk"]) {
				if (localBranches.all.includes(candidate)) {
					return candidate;
				}
			}
			// If we have any local branches, use the first one
			const firstBranch = localBranches.all[0];
			if (firstBranch) {
				return firstBranch;
			}
		} catch {
			// Ignore
		}
	}

	return "main";
}

/**
 * Fetches the default branch from origin.
 */
export async function fetchDefaultBranch({
	mainRepoPath,
	defaultBranch,
}: {
	mainRepoPath: string;
	defaultBranch: string;
}): Promise<string> {
	const git = simpleGit(mainRepoPath);
	await git.fetch("origin", defaultBranch);
	const commit = await git.revparse(`origin/${defaultBranch}`);
	return commit.trim();
}

/**
 * Refreshes the local origin/HEAD symref from the remote.
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
		await git.remote(["set-head", "origin", "--auto"]);
		const headRef = await git.raw(["symbolic-ref", "refs/remotes/origin/HEAD"]);
		const match = headRef.trim().match(/refs\/remotes\/origin\/(.+)/);
		if (match?.[1]) {
			return match[1];
		}
	} catch {
		try {
			const result = await git.raw(["ls-remote", "--symref", "origin", "HEAD"]);
			const symrefMatch = result.match(/ref:\s+refs\/heads\/(.+?)\tHEAD/);
			if (symrefMatch?.[1]) {
				return symrefMatch[1];
			}
		} catch {
			// Network unavailable
		}
	}

	return null;
}

/**
 * Lists all local and remote branches in a repository.
 */
export async function listBranches(
	repoPath: string,
	options?: { fetch?: boolean },
): Promise<{ local: string[]; remote: string[] }> {
	const git = simpleGit(repoPath);

	if (options?.fetch) {
		try {
			await git.fetch(["--prune"]);
		} catch {
			// Ignore fetch errors
		}
	}

	const localResult = await git.branchLocal();
	const local = localResult.all;

	const remoteResult = await git.branch(["-r"]);
	const remote = remoteResult.all
		.filter((b) => b.startsWith("origin/") && !b.includes("->"))
		.map((b) => b.replace("origin/", ""));

	return { local, remote };
}

/**
 * Gets the current branch name (HEAD).
 */
export async function getCurrentBranch(
	repoPath: string,
): Promise<string | null> {
	const git = simpleGit(repoPath);
	try {
		const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
		const trimmed = branch.trim();
		return trimmed === "HEAD" ? null : trimmed;
	} catch {
		return null;
	}
}

/**
 * Checks if a branch exists on remote.
 */
export async function branchExistsOnRemote({
	worktreePath,
	branchName,
}: {
	worktreePath: string;
	branchName: string;
}): Promise<BranchExistsResult> {
	const env = await getGitEnv();

	try {
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
		return { status: "exists" };
	} catch (error) {
		if (!isExecFileException(error)) {
			return {
				status: "error",
				message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
			};
		}

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
			return {
				status: "error",
				message: `System error: ${error.code}`,
			};
		}

		if (error.killed || error.signal) {
			return {
				status: "error",
				message: "Git command timed out. Check your network connection.",
			};
		}

		if (error.code === GIT_EXIT_CODES.NO_MATCHING_REFS) {
			return { status: "not_found" };
		}

		const errorText = error.stderr || error.message || "";
		return categorizeGitError(errorText);
	}
}

/**
 * Detects which branch a worktree was likely based off of.
 */
export async function detectBaseBranch({
	worktreePath,
	currentBranch,
	defaultBranch,
}: {
	worktreePath: string;
	currentBranch: string;
	defaultBranch: string;
}): Promise<string | null> {
	const git = simpleGit(worktreePath);

	const candidates = [
		defaultBranch,
		"main",
		"master",
		"develop",
		"development",
	].filter((b, i, arr) => arr.indexOf(b) === i);

	let bestCandidate: string | null = null;
	let bestAheadCount = Number.POSITIVE_INFINITY;

	for (const candidate of candidates) {
		if (candidate === currentBranch) continue;

		try {
			const remoteBranch = `origin/${candidate}`;
			await git.raw(["rev-parse", "--verify", remoteBranch]);

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
		} catch {
			// Ignore
		}
	}

	return bestCandidate;
}

/**
 * Checks if a git ref exists locally.
 */
export async function refExistsLocally(
	repoPath: string,
	ref: string,
): Promise<boolean> {
	const git = simpleGit(repoPath);
	try {
		await git.raw(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
		return true;
	} catch {
		return false;
	}
}

/**
 * Checks out a branch in a repository.
 */
export async function checkoutBranch(
	repoPath: string,
	branch: string,
): Promise<void> {
	const git = simpleGit(repoPath);

	const localBranches = await git.branchLocal();
	if (localBranches.all.includes(branch)) {
		await git.checkout(branch);
		return;
	}

	const remoteBranches = await git.branch(["-r"]);
	const remoteBranchName = `origin/${branch}`;
	if (remoteBranches.all.includes(remoteBranchName)) {
		await git.checkout(["-b", branch, "--track", remoteBranchName]);
		return;
	}

	await git.checkout(branch);
}

/**
 * Sanitizes git error messages for user display.
 */
export function sanitizeGitError(message: string): string {
	return message
		.replace(/^fatal:\s*/i, "")
		.replace(/^error:\s*/i, "")
		.replace(/\n+/g, " ")
		.trim();
}
