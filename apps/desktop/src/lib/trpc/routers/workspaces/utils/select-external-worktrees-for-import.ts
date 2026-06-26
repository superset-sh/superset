import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { ExternalWorktree } from "./git";

interface SelectArgs {
	mainRepoPath: string;
	/** When provided, only worktrees whose path is in this set are returned. */
	requested?: Set<string>;
}

/**
 * Resolves a path to its canonical form so two paths that point at the same
 * location compare equal. On macOS, repos on external drives are reached via
 * `/Volumes/...` mount aliases (symlinks/firmlinks), but `git worktree list`
 * reports the realpath-resolved location. Without normalizing, the user-provided
 * main repo and requested paths never string-match git's output — so import
 * silently skips every worktree (and fails to exclude the main repo). See #4989.
 * Mirrors the normalization used by the delete procedures.
 */
function normalizePath(p: string): string {
	try {
		return realpathSync(p);
	} catch {
		return resolve(p);
	}
}

/**
 * Apply the same filter rules used when bulk-importing external worktrees:
 * skip the main repo, bare/detached worktrees, and branch-less worktrees. When
 * `requested` is provided, also skip worktrees not in that set. Paths are
 * normalized to their canonical form before comparison so symlinked mount
 * aliases (e.g. macOS external drives under `/Volumes/...`) match git's output.
 */
export function selectExternalWorktreesForImport(
	worktrees: ExternalWorktree[],
	{ mainRepoPath, requested }: SelectArgs,
): ExternalWorktree[] {
	const normalizedMainRepoPath = normalizePath(mainRepoPath);
	const normalizedRequested = requested
		? new Set([...requested].map(normalizePath))
		: undefined;

	return worktrees.filter((wt) => {
		const normalizedPath = normalizePath(wt.path);
		if (normalizedRequested && !normalizedRequested.has(normalizedPath))
			return false;
		if (normalizedPath === normalizedMainRepoPath) return false;
		if (wt.isBare) return false;
		if (wt.isDetached) return false;
		if (!wt.branch) return false;
		return true;
	});
}
