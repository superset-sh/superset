import type { GitClient } from "./types";
import { listGitWorktrees, normalizeWorktreePath } from "./worktree-list";

function encodeCursor(offset: number): string {
	return Buffer.from(JSON.stringify({ offset })).toString("base64url");
}

export function decodeCursor(cursor: string | undefined): number {
	if (!cursor) return 0;
	try {
		const parsed = JSON.parse(
			Buffer.from(cursor, "base64url").toString("utf8"),
		);
		const offset = typeof parsed.offset === "number" ? parsed.offset : 0;
		return Math.max(0, offset);
	} catch {
		return 0;
	}
}

export function encodeNextCursor(
	offset: number,
	limit: number,
	total: number,
): string | null {
	return offset + limit < total ? encodeCursor(offset + limit) : null;
}

// 30s TTL on `git fetch` per project — keeps rapid searches from thrashing.
const REMOTE_REFETCH_TTL_MS = 30_000;
const lastRemoteRefetch = new Map<string, number>();

export function shouldRefetchRemote(projectId: string): boolean {
	const last = lastRemoteRefetch.get(projectId) ?? 0;
	return Date.now() - last >= REMOTE_REFETCH_TTL_MS;
}

export function markRefetchRemote(projectId: string): void {
	lastRemoteRefetch.set(projectId, Date.now());
}

// No gating on managed root or workspaces table — foreign worktrees
// (user ran `git worktree add` themselves) surface too, so the v2
// picker shows everything git would. `checkedOutBranches` is used to
// disable Checkout when a branch is already in use elsewhere.
export async function listWorktreeBranches(git: GitClient): Promise<{
	worktreeMap: Map<string, string>;
	checkedOutBranches: Set<string>;
}> {
	const worktreeMap = new Map<string, string>();
	const checkedOutBranches = new Set<string>();
	for (const wt of await listGitWorktrees(git)) {
		if (!wt.branch) continue;
		checkedOutBranches.add(wt.branch);
		worktreeMap.set(wt.branch, wt.path);
	}
	return { worktreeMap, checkedOutBranches };
}

/**
 * Check whether a git worktree is registered at `worktreePath` with the given
 * branch checked out. Used by adopt when the caller provides an explicit path
 * (e.g. v1→v2 migration) rather than a Superset-managed `.worktrees/<branch>`
 * path discovered via `listWorktreeBranches`.
 */
export async function findWorktreeAtPath(
	git: GitClient,
	worktreePath: string,
	expectedBranch: string,
): Promise<boolean> {
	const branch = await getWorktreeBranchAtPath(git, worktreePath);
	return branch === expectedBranch;
}

/**
 * Returns the branch currently checked out at a registered git worktree path.
 * Explicit path adoption uses this so stale database branch names do not make
 * migration skip a perfectly valid worktree.
 */
export async function getWorktreeBranchAtPath(
	git: GitClient,
	worktreePath: string,
): Promise<string | null> {
	const targetPath = normalizeWorktreePath(worktreePath);
	for (const wt of await listGitWorktrees(git)) {
		if (normalizeWorktreePath(wt.path) === targetPath) {
			return wt.branch;
		}
	}
	return null;
}

// Parses `git log -g` to return {branchName: ordinal} where 0 = most recent.
export async function getRecentBranchOrder(
	git: GitClient,
	limit: number,
): Promise<Map<string, number>> {
	const order = new Map<string, number>();
	try {
		const raw = await git.raw([
			"log",
			"-g",
			"--pretty=%gs",
			"--grep-reflog=checkout:",
			"-n",
			"500",
			"HEAD",
			"--",
		]);
		const re = /^checkout: moving from .+ to (.+)$/;
		for (const line of raw.split("\n")) {
			const match = re.exec(line);
			if (!match?.[1]) continue;
			const name = match[1].trim();
			if (!name || /^[0-9a-f]{7,40}$/.test(name)) continue;
			if (!order.has(name)) {
				order.set(name, order.size);
				if (order.size >= limit) break;
			}
		}
	} catch {
		// ignore (e.g. unborn branch)
	}
	return order;
}
