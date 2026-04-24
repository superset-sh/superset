import { resolve, sep } from "node:path";
import { eq } from "drizzle-orm";
import { workspaces } from "../../../db/schema";
import {
	asLocalRef,
	asRemoteRef,
	type ResolvedRef,
} from "../../../runtime/git/refs";
import type { HostServiceContext } from "../../../types";
import { type GitClient, projectWorktreesRoot } from "./helpers";

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
	const targetPath = resolve(worktreePath);
	try {
		const raw = await git.raw(["worktree", "list", "--porcelain"]);
		let currentPath: string | null = null;
		for (const line of raw.split("\n")) {
			if (line.startsWith("worktree ")) {
				currentPath = line.slice("worktree ".length).trim();
			} else if (line.startsWith("branch refs/heads/") && currentPath) {
				if (resolve(currentPath) !== targetPath) continue;
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
			const m = re.exec(line);
			if (!m?.[1]) continue;
			const name = m[1].trim();
			if (!name || /^[0-9a-f]{7,40}$/.test(name)) continue; // skip detached SHAs
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

export async function listBranchNames(
	ctx: HostServiceContext,
	repoPath: string,
): Promise<string[]> {
	const git = await ctx.git(repoPath);
	try {
		const raw = await git.raw([
			"for-each-ref",
			"--sort=-committerdate",
			"--format=%(refname)",
			"refs/heads/",
			"refs/remotes/origin/",
		]);
		const names = new Set<string>();
		for (const refname of raw.trim().split("\n").filter(Boolean)) {
			// Use the full refname's structural prefix to classify (safe — a
			// branch name can't contain `refs/heads/`). Stripping `origin/`
			// from the SHORT name would misclassify a local branch named
			// `origin/foo`. See GIT_REFS.md.
			let name: string;
			if (refname.startsWith("refs/heads/")) {
				name = refname.slice("refs/heads/".length);
			} else if (refname.startsWith("refs/remotes/origin/")) {
				name = refname.slice("refs/remotes/origin/".length);
			} else {
				continue;
			}
			if (name && name !== "HEAD") names.add(name);
		}
		return Array.from(names);
	} catch {
		return [];
	}
}

/**
 * Build a `ResolvedRef` directly from the picker-supplied hint without
 * probing git. Used when the caller already knows whether the row was
 * local or remote-only — the picker has this info per row.
 */
export function buildStartPointFromHint(
	branch: string,
	source: "local" | "remote-tracking",
): ResolvedRef {
	if (source === "local") {
		return {
			kind: "local",
			fullRef: asLocalRef(branch),
			shortName: branch,
		};
	}
	const remote = "origin";
	return {
		kind: "remote-tracking",
		fullRef: asRemoteRef(remote, branch),
		shortName: branch,
		remote,
		remoteShortName: `${remote}/${branch}`,
	};
}
