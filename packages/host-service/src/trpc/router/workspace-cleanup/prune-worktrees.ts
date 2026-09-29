import { normalizeWorktreePath } from "../workspace-creation/shared/worktree-list";

/**
 * Pure classifier for the "prune orphaned / stale worktrees" feature
 * (see issue #5631). Superset mints a git worktree per session under
 * `~/.superset/worktrees/<project-id>/` but never reaps them, so disk
 * usage grows unbounded (the reporter hit 223 GB across 86 worktrees).
 *
 * The IO — listing directories on disk, reading `git worktree list`, and
 * probing branch status — lives in the caller. This function takes the
 * already-gathered facts and decides, conservatively, which worktrees are
 * safe to remove. Keeping it pure is deliberate: deleting the wrong
 * worktree destroys unpushed work, so the decision must be unit-testable
 * in isolation from git and the filesystem.
 */

/** A worktree directory on disk, annotated with everything needed to judge it. */
export interface WorktreeCandidate {
	/** Absolute path to the worktree directory on disk. */
	path: string;
	/**
	 * True when git still tracks this path in `git worktree list`. A path on
	 * disk that git no longer knows about is an orphan (the reporter's 55
	 * fully-orphaned folders).
	 */
	registered: boolean;
	/** Short branch name, or null when detached / bare / unknown. */
	branch: string | null;
	/** Detached HEAD — never auto-pruned (can't reason about its safety). */
	detached: boolean;
	/** Bare worktree / the primary checkout — never a prune target. */
	bare: boolean;
	/** git reports the worktree as locked — respect the user's lock. */
	locked: boolean;
	/**
	 * Commits this worktree's branch is ahead of its base branch
	 * (master/main). `null` means "couldn't determine" and is treated as
	 * unsafe. A local-only branch that is 0 ahead has nothing to lose.
	 */
	commitsAheadOfBase: number | null;
	/** Uncommitted changes in the worktree — never auto-pruned. */
	hasUncommittedChanges: boolean;
	/** Backs a live workspace row in the local store — never a prune target. */
	hasWorkspace: boolean;
	/**
	 * True when this is the project's primary checkout (repoPath). Never a
	 * prune target even though git lists it.
	 */
	isMainWorkspace: boolean;
}

export type PruneReason =
	/** On disk but git no longer tracks it. */
	| "orphaned"
	/** Registered, clean, local-only branch with 0 commits ahead of base. */
	| "stale-local-only";

export interface PruneCandidate {
	path: string;
	reason: PruneReason;
}

export interface KeptWorktree {
	path: string;
	/** Human-readable explanation for why it was spared. */
	reason: string;
}

export interface PrunePlan {
	prune: PruneCandidate[];
	keep: KeptWorktree[];
}

/**
 * Decide which worktrees to prune. Conservative by construction: a worktree
 * is only ever pruned when it clearly cannot hold unrecoverable state.
 *
 * The guard order matters — a worktree that both backs a workspace *and*
 * looks orphaned must be kept, so protective checks run before the prune
 * classifications.
 */
export function planWorktreePrune(
	candidates: readonly WorktreeCandidate[],
): PrunePlan {
	const prune: PruneCandidate[] = [];
	const keep: KeptWorktree[] = [];

	for (const c of candidates) {
		// ── Protective guards (order-independent; any one spares it) ──
		if (c.isMainWorkspace || c.bare) {
			keep.push({ path: c.path, reason: "main workspace" });
			continue;
		}
		if (c.hasWorkspace) {
			keep.push({ path: c.path, reason: "backs a live workspace" });
			continue;
		}
		if (c.locked) {
			keep.push({ path: c.path, reason: "locked" });
			continue;
		}
		if (c.hasUncommittedChanges) {
			keep.push({ path: c.path, reason: "has uncommitted changes" });
			continue;
		}

		// ── Prune classifications ──
		// Orphaned: on disk, git doesn't track it. Because git has no record,
		// there is no branch and thus no unpushed commits reachable *through
		// git* from this path — the directory is dead weight.
		if (!c.registered) {
			prune.push({ path: c.path, reason: "orphaned" });
			continue;
		}

		// Stale local-only: git tracks it, HEAD is on a branch (not detached),
		// the branch is 0 commits ahead of its base, and the tree is clean.
		// Nothing here would be lost by removing the worktree.
		if (
			!c.detached &&
			c.branch !== null &&
			c.commitsAheadOfBase === 0 &&
			!c.hasUncommittedChanges
		) {
			prune.push({ path: c.path, reason: "stale-local-only" });
			continue;
		}

		// Everything else is spared: detached HEADs, branches ahead of base,
		// or worktrees whose ahead-count couldn't be determined (null).
		if (c.detached) {
			keep.push({ path: c.path, reason: "detached HEAD" });
		} else if (c.commitsAheadOfBase === null) {
			keep.push({ path: c.path, reason: "could not determine commit status" });
		} else {
			keep.push({
				path: c.path,
				reason: `${c.commitsAheadOfBase} commit(s) ahead of base`,
			});
		}
	}

	return { prune, keep };
}

/**
 * Given the set of directories found on disk under a project's worktrees root
 * and the paths git currently tracks, return the disk paths git no longer
 * knows about. Path comparison is realpath-normalized so a symlinked stored
 * path (macOS `/var` → `/private/var`) still matches its git registration.
 */
export function findOrphanedWorktreePaths(
	diskPaths: readonly string[],
	registeredPaths: readonly string[],
): string[] {
	const registered = new Set(
		registeredPaths.map((p) => normalizeWorktreePath(p)),
	);
	return diskPaths.filter((p) => !registered.has(normalizeWorktreePath(p)));
}
