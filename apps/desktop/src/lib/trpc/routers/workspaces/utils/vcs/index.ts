/**
 * VCS provider factory and detection.
 *
 * Detects whether a repository uses Git or Jujutsu (jj) and returns the
 * appropriate VcsProvider implementation.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { GitProvider } from "./git-provider";
import { JjProvider } from "./jj-provider";
import type { VcsProvider, VcsType } from "./types";

export type {
	BranchExistsOnRemoteResult,
	ExternalWorkspace,
	VcsProvider,
	VcsType,
} from "./types";

/** Cached providers keyed by repo path */
const providerCache = new Map<string, VcsProvider>();

/**
 * Detect the VCS type for a repository at the given root path.
 * Checks for `.jj` directory (jj colocated mode) first, falls back to git.
 *
 * IMPORTANT: `mainRepoPath` must be the resolved repo root, not an arbitrary
 * subdirectory. Use `getRepoRoot()` to resolve first.
 */
export function detectVcsType(mainRepoPath: string): VcsType {
	if (existsSync(join(mainRepoPath, ".jj"))) {
		return "jj";
	}
	return "git";
}

/** Cached jj CLI availability check (runs once per app session) */
let jjAvailabilityResult: boolean | null = null;

function isJjCliAvailable(): boolean {
	if (jjAvailabilityResult !== null) return jjAvailabilityResult;

	try {
		execFileSync("jj", ["version"], { timeout: 5_000, stdio: "ignore" });
		jjAvailabilityResult = true;
	} catch {
		jjAvailabilityResult = false;
	}
	return jjAvailabilityResult;
}

/**
 * Get the VcsProvider for a repository. Results are cached per repo path.
 *
 * Returns JjProvider for jj repos (detected by `.jj` directory + jj CLI available)
 * and GitProvider for git-only repos or when jj is not installed.
 * In colocated mode, falls back to GitProvider if jj CLI is unavailable.
 */
export function getVcsProvider(mainRepoPath: string): VcsProvider {
	const cached = providerCache.get(mainRepoPath);
	if (cached) return cached;

	const vcsType = detectVcsType(mainRepoPath);
	let provider: VcsProvider;

	if (vcsType === "jj") {
		if (isJjCliAvailable()) {
			console.log(
				`[vcs] Detected jj repo at ${mainRepoPath}, using JjProvider`,
			);
			provider = new JjProvider();
		} else {
			console.warn(
				`[vcs] Detected jj repo at ${mainRepoPath}, but jj CLI not found — using GitProvider`,
			);
			provider = new GitProvider();
		}
	} else {
		provider = new GitProvider();
	}

	providerCache.set(mainRepoPath, provider);
	return provider;
}

/**
 * Clear cached providers. Call when a project is removed or VCS type changes.
 */
export function clearVcsProviderCache(mainRepoPath?: string): void {
	if (mainRepoPath) {
		providerCache.delete(mainRepoPath);
	} else {
		providerCache.clear();
	}
}

/**
 * Resolve the repository root from an arbitrary path.
 * Tries `jj root` first (if jj is available), falls back to git.
 */
export async function getRepoRoot(path: string): Promise<string> {
	// Try jj first — it works for both colocated and pure jj repos
	try {
		const jjProvider = new JjProvider();
		const root = await jjProvider.getRepoRoot(path);
		if (root && existsSync(join(root, ".jj"))) {
			return root;
		}
	} catch {
		// jj not available or not a jj repo, fall through to git
	}

	const gitProvider = new GitProvider();
	return gitProvider.getRepoRoot(path);
}

// Re-export types from git.ts that callers may need
export type {
	BranchExistsResult,
	CheckoutSafetyResult,
	ExternalWorktree,
	PullRequestInfo,
} from "../git";
// Re-export git-specific utilities that are NOT part of the VcsProvider interface.
// These are used directly by callers for git-specific operations (PR handling,
// branch naming, author prefix, etc.).
export {
	checkBranchCheckoutSafety,
	checkNeedsRebase,
	createWorktreeFromPr,
	detectBaseBranch,
	fetchPrBranch,
	generateBranchName,
	getAuthorPrefix,
	getBranchPrefix,
	getGitAuthorName,
	getGitHubUsername,
	getPrInfo,
	getPrLocalBranchName,
	getStatusNoLock,
	parsePrUrl,
	sanitizeAuthorPrefix,
	sanitizeBranchName,
	sanitizeGitError,
} from "../git";
