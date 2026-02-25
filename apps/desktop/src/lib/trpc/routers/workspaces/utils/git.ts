import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rename } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import friendlyWords = require("friendly-words");

import type { BranchPrefixMode } from "@superset/local-db";
import simpleGit, { type StatusResult } from "simple-git";
import { runWithPostCheckoutHookTolerance } from "../../utils/git-hook-tolerance";
import { execWithShellEnv, getProcessEnvWithShellPath } from "./shell-env";

const execFileAsync = promisify(execFile);

export class NotGitRepoError extends Error {
	constructor(repoPath: string) {
		super(`Not a git repository: ${repoPath}`);
		this.name = "NotGitRepoError";
	}
}

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

async function isWorktreeRegistered({
	mainRepoPath,
	worktreePath,
	env,
}: {
	mainRepoPath: string;
	worktreePath: string;
	env: Record<string, string>;
}): Promise<boolean> {
	try {
		const { stdout } = await execFileAsync(
			"git",
			["-C", mainRepoPath, "worktree", "list", "--porcelain"],
			{ env, timeout: 10_000 },
		);

		const expectedPath = resolve(worktreePath);
		for (const line of stdout.split("\n")) {
			if (!line.startsWith("worktree ")) {
				continue;
			}

			const listedPath = line.slice("worktree ".length).trim();
			if (resolve(listedPath) === expectedPath) {
				return true;
			}
		}

		return false;
	} catch {
		return false;
	}
}

/**
 * Runs `git worktree add`, tolerating hook failures.
 * Post-checkout hooks can exit non-zero after the worktree is created.
 * If the worktree exists on disk despite the error, we warn and continue.
 */
async function execWorktreeAdd({
	mainRepoPath,
	args,
	env,
	worktreePath,
	timeout = 120_000,
}: {
	mainRepoPath: string;
	args: string[];
	env: Record<string, string>;
	worktreePath: string;
	timeout?: number;
}): Promise<void> {
	await runWithPostCheckoutHookTolerance({
		context: `Worktree created at ${worktreePath}`,
		run: async () => {
			await execFileAsync("git", args, { env, timeout });
		},
		didSucceed: async () =>
			isWorktreeRegistered({ mainRepoPath, worktreePath, env }),
	});
}

async function checkoutBranchWithHookTolerance({
	repoPath,
	targetBranch,
	run,
}: {
	repoPath: string;
	targetBranch: string;
	run: () => Promise<void>;
}): Promise<void> {
	await runWithPostCheckoutHookTolerance({
		context: `Switched branch to "${targetBranch}" in ${repoPath}`,
		run,
		didSucceed: async () => {
			const current = await getCurrentBranch(repoPath);
			return current === targetBranch;
		},
	});
}

async function getGitEnv(): Promise<Record<string, string>> {
	return getProcessEnvWithShellPath();
}

/**
 * Runs `git status` with --no-optional-locks to avoid holding locks on the repository.
 * This prevents blocking other git operations that may need to acquire locks.
 * Returns a StatusResult-compatible object that can be used with parseGitStatus.
 */
export async function getStatusNoLock(repoPath: string): Promise<StatusResult> {
	const env = await getGitEnv();

	try {
		// Run git status with --no-optional-locks to avoid holding locks
		// Use porcelain=v1 for machine-parseable output, -b for branch info
		// Use -z for NUL-terminated output (handles filenames with special chars)
		// Use -uall to show individual files in untracked directories (not just the directory)
		// Note: porcelain=v1 already includes rename info (R/C status codes) without needing -M
		const { stdout } = await execFileAsync(
			"git",
			[
				"--no-optional-locks",
				"-C",
				repoPath,
				"status",
				"--porcelain=v1",
				"-b",
				"-z",
				"-uall",
			],
			{ env, timeout: 30_000 },
		);

		return parsePortelainStatus(stdout);
	} catch (error) {
		// Provide more descriptive error messages
		if (isExecFileException(error)) {
			if (error.code === "ENOENT") {
				throw new Error("Git is not installed or not found in PATH");
			}
			const stderr = error.stderr || error.message || "";
			if (stderr.includes("not a git repository")) {
				throw new NotGitRepoError(repoPath);
			}
		}
		throw new Error(
			`Failed to get git status: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Parses git status --porcelain=v1 -z output into a StatusResult-compatible object.
 * The -z format uses NUL characters to separate entries, which safely handles
 * filenames containing spaces, newlines, or other special characters.
 */
function parsePortelainStatus(stdout: string): StatusResult {
	// Split by NUL character - the -z format separates entries with NUL
	const entries = stdout.split("\0").filter(Boolean);

	let current: string | null = null;
	let tracking: string | null = null;
	let isDetached = false;

	// Parse file status entries
	const files: StatusResult["files"] = [];
	// Use Sets to avoid duplicates (e.g., MM status would otherwise add to modified twice)
	const stagedSet = new Set<string>();
	const modifiedSet = new Set<string>();
	const deletedSet = new Set<string>();
	const createdSet = new Set<string>();
	const renamed: Array<{ from: string; to: string }> = [];
	const conflictedSet = new Set<string>();
	const notAddedSet = new Set<string>();

	let i = 0;
	while (i < entries.length) {
		const entry = entries[i];
		if (!entry) {
			i++;
			continue;
		}

		// Parse branch line: ## branch...tracking or ## branch
		if (entry.startsWith("## ")) {
			const branchInfo = entry.slice(3);

			// Check for detached HEAD states
			if (branchInfo.startsWith("HEAD (no branch)") || branchInfo === "HEAD") {
				isDetached = true;
				current = "HEAD";
			} else if (
				// Handle empty repo: "No commits yet on BRANCH" or "Initial commit on BRANCH"
				branchInfo.startsWith("No commits yet on ") ||
				branchInfo.startsWith("Initial commit on ")
			) {
				// Extract branch name from the end
				const parts = branchInfo.split(" ");
				current = parts[parts.length - 1] || null;
			} else {
				// Check for tracking info: "branch...origin/branch [ahead 1, behind 2]"
				const trackingMatch = branchInfo.match(/^(.+?)\.\.\.(.+?)(?:\s|$)/);
				if (trackingMatch) {
					current = trackingMatch[1];
					tracking = trackingMatch[2].split(" ")[0] || null;
				} else {
					// No tracking branch, just get branch name (before any space)
					current = branchInfo.split(" ")[0] || null;
				}
			}
			i++;
			continue;
		}

		// Parse file status: "XY path" where X=index, Y=working tree
		if (entry.length < 3) {
			i++;
			continue;
		}

		const indexStatus = entry[0];
		const workingStatus = entry[1];
		// entry[2] is a space separator
		const path = entry.slice(3);
		let from: string | undefined;

		// For renames/copies, the next entry is the original path
		if (indexStatus === "R" || indexStatus === "C") {
			i++;
			from = entries[i];
			renamed.push({ from: from || path, to: path });
		}

		files.push({
			path,
			from: from ?? path,
			index: indexStatus,
			working_dir: workingStatus,
		});

		// Populate convenience arrays for checkBranchCheckoutSafety compatibility
		if (indexStatus === "?" && workingStatus === "?") {
			notAddedSet.add(path);
		} else {
			// Index status (staged changes)
			if (indexStatus === "A") createdSet.add(path);
			else if (indexStatus === "M") {
				stagedSet.add(path);
				modifiedSet.add(path);
			} else if (indexStatus === "D") {
				stagedSet.add(path);
				deletedSet.add(path);
			} else if (indexStatus === "R" || indexStatus === "C")
				stagedSet.add(path);
			else if (indexStatus === "U") conflictedSet.add(path);
			else if (indexStatus !== " " && indexStatus !== "?") stagedSet.add(path);

			// Working tree status (unstaged changes)
			if (workingStatus === "M") modifiedSet.add(path);
			else if (workingStatus === "D") deletedSet.add(path);
			else if (workingStatus === "U") conflictedSet.add(path);
		}

		i++;
	}

	return {
		not_added: [...notAddedSet],
		conflicted: [...conflictedSet],
		created: [...createdSet],
		deleted: [...deletedSet],
		ignored: undefined,
		modified: [...modifiedSet],
		renamed,
		files,
		staged: [...stagedSet],
		ahead: 0,
		behind: 0,
		current,
		tracking,
		detached: isDetached,
		isClean: () =>
			files.length === 0 ||
			files.every((f) => f.index === "?" && f.working_dir === "?"),
	};
}

/** Maximum attempts to find a unique word before falling back to suffixed names */
const MAX_ATTEMPTS = 10;
/** Maximum suffix value to try in fallback (exclusive), e.g., 0-99 */
const FALLBACK_MAX_SUFFIX = 100;

export async function getGitAuthorName(
	repoPath?: string,
): Promise<string | null> {
	try {
		const git = repoPath ? simpleGit(repoPath) : simpleGit();
		const name = await git.getConfig("user.name");
		return name.value?.trim() || null;
	} catch (error) {
		console.warn("[git/getGitAuthorName] Failed to read git user.name:", error);
		return null;
	}
}

let cachedGitHubUsername: { value: string | null; timestamp: number } | null =
	null;
const GITHUB_USERNAME_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getGitHubUsername(
	_repoPath?: string,
): Promise<string | null> {
	if (
		cachedGitHubUsername &&
		Date.now() - cachedGitHubUsername.timestamp < GITHUB_USERNAME_CACHE_TTL
	) {
		return cachedGitHubUsername.value;
	}

	const env = await getGitEnv();

	try {
		const { stdout } = await execFileAsync(
			"gh",
			["api", "user", "--jq", ".login"],
			{ env, timeout: 10_000 },
		);
		const value = stdout.trim() || null;
		cachedGitHubUsername = { value, timestamp: Date.now() };
		return value;
	} catch (error) {
		console.warn(
			"[git/getGitHubUsername] Failed to get GitHub username:",
			error instanceof Error ? error.message : String(error),
		);
		cachedGitHubUsername = { value: null, timestamp: Date.now() };
		return null;
	}
}

export async function getAuthorPrefix(
	repoPath?: string,
): Promise<string | null> {
	const githubUsername = await getGitHubUsername(repoPath);
	if (githubUsername) {
		return githubUsername;
	}

	const gitAuthorName = await getGitAuthorName(repoPath);
	if (gitAuthorName) {
		return gitAuthorName;
	}

	return null;
}

export async function getBranchPrefix({
	repoPath,
	mode,
	customPrefix,
}: {
	repoPath: string;
	mode?: BranchPrefixMode | null;
	customPrefix?: string | null;
}): Promise<string | null> {
	switch (mode) {
		case "none":
			return null;
		case "custom":
			return customPrefix || null;
		case "author": {
			const authorName = await getGitAuthorName(repoPath);
			if (authorName) {
				return authorName.toLowerCase().replace(/\s+/g, "-");
			}
			return null;
		}
		default:
			return getAuthorPrefix(repoPath);
	}
}

export {
	sanitizeAuthorPrefix,
	sanitizeBranchName,
} from "shared/utils/branch";

export function generateBranchName({
	existingBranches = [],
	authorPrefix,
}: {
	existingBranches?: string[];
	authorPrefix?: string;
} = {}): string {
	const words = friendlyWords.objects as string[];
	const existingSet = new Set(existingBranches.map((b) => b.toLowerCase()));

	const prefixWouldCollide =
		authorPrefix && existingSet.has(authorPrefix.toLowerCase());
	const safePrefix = prefixWouldCollide ? undefined : authorPrefix;

	const addPrefix = (name: string): string => {
		if (safePrefix) {
			return `${safePrefix}/${name}`;
		}
		return name;
	};

	for (let i = 0; i < MAX_ATTEMPTS; i++) {
		const word = words[Math.floor(Math.random() * words.length)];
		const candidate = addPrefix(word);
		if (!existingSet.has(candidate.toLowerCase())) {
			return candidate;
		}
	}

	const baseWord = words[Math.floor(Math.random() * words.length)];
	for (let n = 0; n < FALLBACK_MAX_SUFFIX; n++) {
		const candidate = addPrefix(`${baseWord}-${n}`);
		if (!existingSet.has(candidate.toLowerCase())) {
			return candidate;
		}
	}

	return addPrefix(`${baseWord}-${Date.now()}`);
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

		const env = await getGitEnv();

		await execWorktreeAdd({
			mainRepoPath,
			args: [
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
			env,
			worktreePath,
		});

		// Enable autoSetupRemote so the first `git push` automatically creates
		// the remote branch and sets upstream (like `git push -u origin <branch>`).
		await execFileAsync(
			"git",
			["-C", worktreePath, "config", "--local", "push.autoSetupRemote", "true"],
			{ env, timeout: 10_000 },
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

		console.error(`Failed to create worktree: ${errorMessage}`);
		throw new Error(`Failed to create worktree: ${errorMessage}`);
	}
}

/**
 * Creates a worktree from an existing branch (local or remote).
 * Unlike createWorktree, this does NOT create a new branch.
 */
export async function createWorktreeFromExistingBranch({
	mainRepoPath,
	branch,
	worktreePath,
}: {
	mainRepoPath: string;
	branch: string;
	worktreePath: string;
}): Promise<void> {
	try {
		const parentDir = join(worktreePath, "..");
		await mkdir(parentDir, { recursive: true });

		const env = await getGitEnv();

		const git = simpleGit(mainRepoPath);
		const localBranches = await git.branchLocal();
		const branchExistsLocally = localBranches.all.includes(branch);

		if (branchExistsLocally) {
			await execWorktreeAdd({
				mainRepoPath,
				args: ["-C", mainRepoPath, "worktree", "add", worktreePath, branch],
				env,
				worktreePath,
			});
		} else {
			const remoteBranches = await git.branch(["-r"]);
			const remoteBranchName = `origin/${branch}`;
			if (remoteBranches.all.includes(remoteBranchName)) {
				await execWorktreeAdd({
					mainRepoPath,
					args: [
						"-C",
						mainRepoPath,
						"worktree",
						"add",
						"--track",
						"-b",
						branch,
						worktreePath,
						remoteBranchName,
					],
					env,
					worktreePath,
				});
			} else {
				throw new Error(
					`Branch "${branch}" does not exist locally or on remote`,
				);
			}
		}

		// Enable autoSetupRemote so the first `git push` automatically creates
		// the remote branch and sets upstream (like `git push -u origin <branch>`).
		await execFileAsync(
			"git",
			["-C", worktreePath, "config", "--local", "push.autoSetupRemote", "true"],
			{ env, timeout: 10_000 },
		);

		console.log(
			`Created worktree at ${worktreePath} using existing branch ${branch}`,
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

		// Check if the branch is already checked out in another worktree
		if (
			lowerError.includes("already checked out") ||
			lowerError.includes("is already used by worktree")
		) {
			throw new Error(
				`Branch "${branch}" is already checked out in another worktree. ` +
					`Each branch can only be checked out in one worktree at a time.`,
			);
		}

		console.error(`Failed to create worktree: ${errorMessage}`);
		throw new Error(`Failed to create worktree: ${errorMessage}`);
	}
}

export async function deleteLocalBranch({
	mainRepoPath,
	branch,
}: {
	mainRepoPath: string;
	branch: string;
}): Promise<void> {
	const env = await getGitEnv();

	try {
		await execFileAsync("git", ["-C", mainRepoPath, "branch", "-D", branch], {
			env,
			timeout: 10_000,
		});
		console.log(`[workspace/delete] Deleted local branch "${branch}"`);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(
			`[workspace/delete] Failed to delete local branch "${branch}": ${errorMessage}`,
		);
		throw new Error(
			`Failed to delete local branch "${branch}": ${errorMessage}`,
		);
	}
}

export async function removeWorktree(
	mainRepoPath: string,
	worktreePath: string,
): Promise<void> {
	try {
		const env = await getGitEnv();

		// Rename the worktree to a sibling temp dir (same filesystem to avoid EXDEV),
		// then `git worktree prune` to clean metadata, then delete in background.
		const tempPath = join(
			dirname(worktreePath),
			`.superset-delete-${randomUUID()}`,
		);
		await rename(worktreePath, tempPath);

		await execFileAsync("git", ["-C", mainRepoPath, "worktree", "prune"], {
			env,
			timeout: 10_000,
		});

		// Delete the moved directory in the background — don't block the caller.
		// Use spawned `rm -rf` instead of Node's fs.rm which can hang on macOS
		// when encountering .app bundles with extended attributes.
		const child = spawn("/bin/rm", ["-rf", tempPath], {
			detached: true,
			stdio: "ignore",
		});
		child.unref();
		child.on("error", (err) => {
			console.error(
				`[removeWorktree] Failed to spawn rm for ${tempPath}:`,
				err.message,
			);
		});
		child.on("exit", (code: number | null) => {
			if (code !== 0) {
				console.error(
					`[removeWorktree] Background cleanup of ${tempPath} failed (exit ${code})`,
				);
			}
		});
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		// If the worktree directory is already gone, just prune metadata
		if (code === "ENOENT") {
			try {
				const env = await getGitEnv();
				await execFileAsync("git", ["-C", mainRepoPath, "worktree", "prune"], {
					env,
					timeout: 10_000,
				});
			} catch {}
			return;
		}
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
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.toLowerCase().includes("not a git repository")) {
			throw new NotGitRepoError(path);
		}
		throw error;
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

export interface ExternalWorktree {
	path: string;
	branch: string | null;
	isDetached: boolean;
	isBare: boolean;
}

export async function listExternalWorktrees(
	mainRepoPath: string,
): Promise<ExternalWorktree[]> {
	try {
		const git = simpleGit(mainRepoPath);
		const output = await git.raw(["worktree", "list", "--porcelain"]);

		const result: ExternalWorktree[] = [];
		let current: Partial<ExternalWorktree> = {};

		for (const line of output.split("\n")) {
			if (line.startsWith("worktree ")) {
				if (current.path) {
					result.push({
						path: current.path,
						branch: current.branch ?? null,
						isDetached: current.isDetached ?? false,
						isBare: current.isBare ?? false,
					});
				}
				current = { path: line.slice("worktree ".length) };
			} else if (line.startsWith("branch refs/heads/")) {
				current.branch = line.slice("branch refs/heads/".length);
			} else if (line === "detached") {
				current.isDetached = true;
			} else if (line === "bare") {
				current.isBare = true;
			}
		}

		if (current.path) {
			result.push({
				path: current.path,
				branch: current.branch ?? null,
				isDetached: current.isDetached ?? false,
				isBare: current.isBare ?? false,
			});
		}

		return result;
	} catch (error) {
		console.error(`Failed to list external worktrees: ${error}`);
		throw error;
	}
}

/**
 * Checks if a branch is already checked out in a worktree.
 * @param mainRepoPath - Path to the main repository
 * @param branch - The branch name to check
 * @returns The worktree path if the branch is checked out, null otherwise
 */
export async function getBranchWorktreePath({
	mainRepoPath,
	branch,
}: {
	mainRepoPath: string;
	branch: string;
}): Promise<string | null> {
	try {
		const git = simpleGit(mainRepoPath);
		const worktreesOutput = await git.raw(["worktree", "list", "--porcelain"]);

		const lines = worktreesOutput.split("\n");
		let currentWorktreePath: string | null = null;

		for (const line of lines) {
			if (line.startsWith("worktree ")) {
				// Reset path for each new worktree entry to handle detached HEAD worktrees
				// that don't have a "branch" line
				currentWorktreePath = line.slice("worktree ".length);
			} else if (line.startsWith("branch refs/heads/")) {
				const branchName = line.slice("branch refs/heads/".length);
				if (branchName === branch && currentWorktreePath) {
					return currentWorktreePath;
				}
				// Reset after processing this worktree's branch line
				currentWorktreePath = null;
			}
		}

		return null;
	} catch (error) {
		console.error(`Failed to check branch worktree: ${error}`);
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

export async function getAheadBehindCount({
	repoPath,
	defaultBranch,
}: {
	repoPath: string;
	defaultBranch: string;
}): Promise<{ ahead: number; behind: number }> {
	const git = simpleGit(repoPath);
	try {
		const output = await git.raw([
			"rev-list",
			"--left-right",
			"--count",
			`origin/${defaultBranch}...HEAD`,
		]);
		const [behindStr, aheadStr] = output.trim().split(/\s+/);
		return {
			ahead: Number.parseInt(aheadStr || "0", 10),
			behind: Number.parseInt(behindStr || "0", 10),
		};
	} catch {
		return { ahead: 0, behind: 0 };
	}
}

export async function hasUncommittedChanges(
	worktreePath: string,
): Promise<boolean> {
	const status = await getStatusNoLock(worktreePath);
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

	const localResult = await git.branchLocal();
	const local = localResult.all;

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
	try {
		const status = await getStatusNoLock(repoPath);

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
			const git = simpleGit(repoPath);
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

	const localBranches = await git.branchLocal();
	if (localBranches.all.includes(branch)) {
		await checkoutBranchWithHookTolerance({
			repoPath,
			targetBranch: branch,
			run: async () => {
				await git.checkout(branch);
			},
		});
		return;
	}

	const remoteBranches = await git.branch(["-r"]);
	const remoteBranchName = `origin/${branch}`;
	if (remoteBranches.all.includes(remoteBranchName)) {
		await checkoutBranchWithHookTolerance({
			repoPath,
			targetBranch: branch,
			run: async () => {
				await git.checkout(["-b", branch, "--track", remoteBranchName]);
			},
		});
		return;
	}

	await checkoutBranchWithHookTolerance({
		repoPath,
		targetBranch: branch,
		run: async () => {
			await git.checkout(branch);
		},
	});
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
	const currentBranch = await getCurrentBranch(repoPath);
	if (currentBranch === branch) {
		return;
	}

	const safety = await checkBranchCheckoutSafety(repoPath);
	if (!safety.safe) {
		throw new Error(safety.error);
	}

	await checkoutBranch(repoPath, branch);

	const verifyBranch = await getCurrentBranch(repoPath);
	if (verifyBranch !== branch) {
		throw new Error(
			`Branch checkout verification failed: expected "${branch}" but HEAD is on "${verifyBranch ?? "detached HEAD"}"`,
		);
	}
}

/**
 * PR info returned from GitHub CLI
 */
export interface PullRequestInfo {
	number: number;
	title: string;
	headRefName: string;
	headRepository: {
		owner: string;
		name: string;
	};
	headRepositoryOwner: {
		login: string;
	};
	isCrossRepository: boolean;
}

/**
 * Gets the local branch name for a PR.
 * For fork PRs, prefixes with the fork owner to avoid conflicts.
 */
export function getPrLocalBranchName(prInfo: PullRequestInfo): string {
	if (prInfo.isCrossRepository) {
		const forkOwner = prInfo.headRepositoryOwner.login.toLowerCase();
		return `${forkOwner}/${prInfo.headRefName}`;
	}
	return prInfo.headRefName;
}

/**
 * Parses a GitHub PR URL to extract owner, repo, and PR number.
 * Supports formats:
 * - https://github.com/owner/repo/pull/123
 * - https://github.com/owner/repo/pull/123/
 * - github.com/owner/repo/pull/123
 */
export function parsePrUrl(url: string): {
	owner: string;
	repo: string;
	number: number;
} | null {
	// Normalize URL - add https:// if missing
	let normalizedUrl = url.trim();
	if (!normalizedUrl.startsWith("http")) {
		normalizedUrl = `https://${normalizedUrl}`;
	}

	try {
		const urlObj = new URL(normalizedUrl);
		if (!urlObj.hostname.includes("github.com")) {
			return null;
		}

		// Match /owner/repo/pull/number pattern
		const match = urlObj.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
		if (!match) {
			return null;
		}

		return {
			owner: match[1],
			repo: match[2],
			number: Number.parseInt(match[3], 10),
		};
	} catch {
		return null;
	}
}

/**
 * Fetches PR information using the GitHub CLI.
 * @param owner - The repository owner from the PR URL
 * @param repo - The repository name from the PR URL
 * @param prNumber - The PR number to fetch
 * @returns PR info or throws if not found/error
 */
export async function getPrInfo({
	owner,
	repo,
	prNumber,
}: {
	owner: string;
	repo: string;
	prNumber: number;
}): Promise<PullRequestInfo> {
	try {
		const { stdout } = await execWithShellEnv(
			"gh",
			[
				"pr",
				"view",
				String(prNumber),
				"--repo",
				`${owner}/${repo}`,
				"--json",
				"number,title,headRefName,headRepository,headRepositoryOwner,isCrossRepository",
			],
			{ timeout: 30_000 },
		);

		return JSON.parse(stdout) as PullRequestInfo;
	} catch (error) {
		if (isExecFileException(error)) {
			if (error.code === "ENOENT") {
				throw new Error(
					"GitHub CLI (gh) is not installed. Please install it from https://cli.github.com/",
				);
			}
			const stderr = error.stderr || error.message || "";
			if (stderr.includes("not logged in")) {
				throw new Error(
					"Not logged in to GitHub CLI. Please run 'gh auth login' first.",
				);
			}
			if (
				stderr.includes("Could not resolve") ||
				stderr.includes("not found")
			) {
				throw new Error(`PR #${prNumber} not found in ${owner}/${repo}`);
			}
		}
		throw new Error(
			`Failed to fetch PR info: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Creates a worktree from a PR.
 * Uses `gh pr checkout` inside the new worktree to resolve fork/head remotes.
 */
export async function createWorktreeFromPr({
	mainRepoPath,
	worktreePath,
	prInfo,
	localBranchName,
}: {
	mainRepoPath: string;
	worktreePath: string;
	prInfo: PullRequestInfo;
	localBranchName: string;
}): Promise<void> {
	const env = await getGitEnv();

	try {
		const parentDir = join(worktreePath, "..");
		await mkdir(parentDir, { recursive: true });

		const git = simpleGit(mainRepoPath);
		const localBranches = await git.branchLocal();
		const branchExists = localBranches.all.includes(localBranchName);

		if (branchExists) {
			await execWorktreeAdd({
				mainRepoPath,
				args: [
					"-C",
					mainRepoPath,
					"worktree",
					"add",
					worktreePath,
					localBranchName,
				],
				env,
				worktreePath,
			});
		} else {
			await execWorktreeAdd({
				mainRepoPath,
				args: ["-C", mainRepoPath, "worktree", "add", "--detach", worktreePath],
				env,
				worktreePath,
			});
		}

		await execWithShellEnv(
			"gh",
			[
				"pr",
				"checkout",
				String(prInfo.number),
				"--branch",
				localBranchName,
				"--force",
			],
			{ cwd: worktreePath, timeout: 120_000 },
		);

		// Enable autoSetupRemote so `git push` just works without -u flag.
		await execFileAsync(
			"git",
			["-C", worktreePath, "config", "--local", "push.autoSetupRemote", "true"],
			{ env, timeout: 10_000 },
		);

		console.log(
			`[git] Created worktree at ${worktreePath} for PR #${prInfo.number}`,
		);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const lowerError = errorMessage.toLowerCase();

		if (
			lowerError.includes("already checked out") ||
			lowerError.includes("is already used by worktree")
		) {
			throw new Error(
				`This PR's branch is already checked out in another worktree.`,
			);
		}
		throw new Error(`Failed to create worktree from PR: ${errorMessage}`);
	}
}
