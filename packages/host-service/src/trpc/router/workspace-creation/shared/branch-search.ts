import { resolve as resolvePath, sep } from "node:path";
import { eq } from "drizzle-orm";
import { workspaces } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import type { GitClient } from "./types";
import { projectWorktreesRoot } from "./worktree-paths";

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

export async function listWorktreeBranches(
	ctx: HostServiceContext,
	git: GitClient,
	projectId: string,
): Promise<{
	// A worktree counts as "ours" if its path either matches a row in
	// the local `workspaces` table or lives under our managed root. The
	// second case catches orphans (worktree on disk, no workspaces row,
	// e.g. partial create rollback) so they surface for adoption.
	worktreeMap: Map<string, string>;
	// Every branch checked out in any git worktree, including the primary
	// working tree. Used to disable the Checkout action when a branch is
	// already in use elsewhere — `git worktree add <path> <branch>` would fail.
	checkedOutBranches: Set<string>;
}> {
	const managedRoot = projectWorktreesRoot(projectId);
	const knownPaths = new Set<string>(
		ctx.db
			.select({ path: workspaces.worktreePath })
			.from(workspaces)
			.where(eq(workspaces.projectId, projectId))
			.all()
			.map((w) => w.path),
	);
	const worktreeMap = new Map<string, string>();
	const checkedOutBranches = new Set<string>();
	try {
		const raw = await git.raw(["worktree", "list", "--porcelain"]);
		let currentPath: string | null = null;
		for (const line of raw.split("\n")) {
			if (line.startsWith("worktree ")) {
				currentPath = line.slice("worktree ".length).trim();
			} else if (line.startsWith("branch refs/heads/") && currentPath) {
				const branch = line.slice("branch refs/heads/".length).trim();
				if (!branch) continue;
				checkedOutBranches.add(branch);
				if (
					knownPaths.has(currentPath) ||
					currentPath.startsWith(managedRoot + sep)
				) {
					worktreeMap.set(branch, currentPath);
				}
			} else if (line === "") {
				currentPath = null;
			}
		}
	} catch (err) {
		console.warn(
			"[workspace-creation] git worktree list failed; treating no branches as checked out:",
			err,
		);
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
	const targetPath = resolvePath(worktreePath);
	try {
		const raw = await git.raw(["worktree", "list", "--porcelain"]);
		let currentPath: string | null = null;
		for (const line of raw.split("\n")) {
			if (line.startsWith("worktree ")) {
				currentPath = line.slice("worktree ".length).trim();
			} else if (line.startsWith("branch refs/heads/") && currentPath) {
				if (resolvePath(currentPath) !== targetPath) continue;
				const branch = line.slice("branch refs/heads/".length).trim();
				return branch === expectedBranch;
			} else if (line === "") {
				currentPath = null;
			}
		}
	} catch (err) {
		console.warn(
			"[workspace-creation] git worktree list failed in findWorktreeAtPath:",
			err,
		);
	}
	return false;
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
