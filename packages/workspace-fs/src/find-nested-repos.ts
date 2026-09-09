import { readdir } from "node:fs/promises";
import path from "node:path";

// Defensive caps: the whole point of this scan is to keep the watcher from
// ballooning, so the scan itself must never balloon. It prunes at every nested
// repo boundary and at every ignored directory, so a normal tree is scanned in
// full and a pathological one (a project holding thousands of agent worktrees)
// is bounded by the count of worktree roots, not their contents.
const DEFAULT_MAX_QUEUED_DIRS = 50_000;
const DEFAULT_MAX_ROOTS = 5_000;

export interface FindNestedRepoRootsOptions {
	/** Directory basenames to skip while traversing (node_modules, .git, …). */
	pruneDirNames: ReadonlySet<string>;
	/**
	 * Most directory paths the traversal queue may hold. Bounds the work — a
	 * directory is only ever visited after being queued — and, unlike a cap on
	 * directories *visited*, it also bounds what the scan is holding while it
	 * runs: the queue is the breadth-first frontier and is retained until the
	 * scan returns.
	 */
	maxQueuedDirs?: number;
	/** Stop after discovering this many nested roots. */
	maxRoots?: number;
	/**
	 * Wall-clock budget in ms. Bounds the scan on a slow/network-backed FS where
	 * `readdir` latency (not directory count) is the limiter. Omit to disable.
	 */
	deadlineMs?: number;
	/** Injectable clock (defaults to `Date.now`) so the deadline is testable. */
	now?: () => number;
}

export interface FindNestedRepoRootsResult {
	/** Absolute paths of nested git repo / worktree roots below `rootPath`. */
	roots: string[];
	/** A scan cap (count or time) was hit; `roots` may be incomplete. */
	truncated: boolean;
}

/**
 * Walk `rootPath` and return every nested git repo / worktree root beneath it.
 * A directory is a nested root when it contains a `.git` entry (a directory for
 * a normal clone, a file for a `git worktree`); the watch root itself is exempt.
 * The scan prunes at each nested root (never descends into it) and at each
 * `pruneDirNames` entry, so it stays cheap even under a tree that has grown to
 * millions of directories via piled-up worktrees.
 *
 * Traversal is breadth-first, so when a cap truncates the scan the shallow
 * nested repos (the piled-up worktree roots near the top) are found before a
 * deep non-repo subtree can exhaust the budget. Breadth-first also means the
 * queue holds every directory discovered but not yet visited, which is why
 * `maxQueuedDirs` caps the queue rather than the visit count: the frontier is
 * what a scan is still holding when a deadline stops it, and every watcher
 * attaching at the same time holds one of its own.
 *
 * Symlinked directories are skipped (`Dirent.isDirectory()` is false for them),
 * which also avoids cycles and escaping the tree.
 */
export async function findNestedRepoRoots(
	rootPath: string,
	options: FindNestedRepoRootsOptions,
): Promise<FindNestedRepoRootsResult> {
	const maxQueuedDirs = options.maxQueuedDirs ?? DEFAULT_MAX_QUEUED_DIRS;
	const maxRoots = options.maxRoots ?? DEFAULT_MAX_ROOTS;
	const now = options.now ?? Date.now;
	const deadline =
		options.deadlineMs !== undefined ? now() + options.deadlineMs : null;
	const roots: string[] = [];
	// FIFO queue with a head cursor — plain `shift()` would be O(n) per dequeue.
	const queue: string[] = [rootPath];
	let head = 0;
	let truncated = false;

	while (head < queue.length) {
		if (roots.length >= maxRoots || (deadline !== null && now() >= deadline)) {
			return { roots, truncated: true };
		}
		const dir = queue[head++] as string;

		// Vanished or unreadable mid-scan — nothing to prune here.
		const entries = await readdir(dir, { withFileTypes: true }).catch(
			() => null,
		);
		if (!entries) {
			continue;
		}

		if (dir !== rootPath && entries.some((entry) => entry.name === ".git")) {
			roots.push(dir);
			continue; // prune: do not descend into the nested repo
		}

		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue;
			}
			if (options.pruneDirNames.has(entry.name)) {
				continue;
			}
			if (queue.length >= maxQueuedDirs) {
				// Stop widening, but keep draining what is already queued: those
				// directories are shallower than the ones being dropped, and
				// shallow is where the piled-up worktree roots are.
				truncated = true;
				break;
			}
			queue.push(path.join(dir, entry.name));
		}
	}

	return { roots, truncated };
}
