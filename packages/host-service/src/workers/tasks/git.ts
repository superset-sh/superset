// git/* worker tasks. Handlers build their own SimpleGit — the worker spawns
// the git subprocesses itself, so stdout draining AND parsing leave the
// host-service event loop. Credential env is resolved in-process (it needs
// the credential provider) and crosses as plain data.

import {
	type ResolvedGitInfo,
	readGitIdentity,
} from "../../runtime/git/identity.ts";
import { createUserSimpleGit } from "../../runtime/git/simple-git.ts";
import {
	readWorkspaceRefs,
	type WorkspaceRefsSnapshot,
} from "../../runtime/pull-requests/utils/workspace-refs.ts";
import type {
	ChangedFile,
	CommitMetadata,
	GraphRefScope,
} from "../../trpc/router/git/types.ts";
import type { BaseRefFetchTarget } from "../../trpc/router/git/utils/base-ref-freshness.ts";
import {
	getChangedFilesForDiff,
	resolveBaseComparison,
} from "../../trpc/router/git/utils/git-helpers.ts";
import type { GitStatusSnapshotComputation } from "../../trpc/router/git/utils/git-status.ts";
import { getGitStatusSnapshot } from "../../trpc/router/git/utils/git-status.ts";
import {
	buildTipSet,
	type GraphLogTaskOutput,
	type GraphRefRecord,
	parseForEachRef,
	parseGraphLog,
	parseMergedBranches,
	worktreeByBranch,
} from "../../trpc/router/git/utils/graph-log.ts";
import {
	normalizeWorktreePath,
	parseWorktreeList,
} from "../../trpc/router/workspace-creation/shared/worktree-list.ts";
import { defineWorkerTask } from "../define-worker-task.ts";

export interface GitTaskEnv {
	[key: string]: string;
}

export const gitStatusSnapshotTask = defineWorkerTask<
	{ worktreePath: string; baseBranch?: string; gitEnv: GitTaskEnv },
	GitStatusSnapshotComputation
>({
	type: "git/getStatusSnapshot",
	handler: async ({ worktreePath, baseBranch, gitEnv }) => {
		const git = createUserSimpleGit(worktreePath).env(gitEnv);
		return getGitStatusSnapshot({ git, worktreePath, baseBranch });
	},
});

export const gitFetchBaseRefTask = defineWorkerTask<
	{
		worktreePath: string;
		target: BaseRefFetchTarget;
		gitEnv: GitTaskEnv;
	},
	void
>({
	type: "git/fetchBaseRef",
	handler: async ({ worktreePath, target, gitEnv }) => {
		const git = createUserSimpleGit(worktreePath).env(gitEnv);
		await git.fetch([target.remote, target.branch, "--quiet", "--no-tags"]);
	},
});

export const gitCommitFilesTask = defineWorkerTask<
	{
		worktreePath: string;
		commitHash: string;
		fromHash?: string;
		gitEnv: GitTaskEnv;
	},
	{ files: ChangedFile[]; commit: CommitMetadata | null }
>({
	type: "git/getCommitFiles",
	handler: async ({ worktreePath, commitHash, fromHash, gitEnv }) => {
		const git = createUserSimpleGit(worktreePath).env(gitEnv);
		const from = fromHash ? fromHash : `${commitHash}^`;
		// Fetch the commit's full metadata alongside the file list — one extra
		// spawn in the worker, so a diff pane gets its header for free with no
		// second round-trip. %B is last and may contain tabs, so it is split off
		// by position rather than by a delimiter it could contain.
		const format = "%H%x09%h%x09%P%x09%an%x09%ae%x09%aI%x09%B";
		const [files, metaRaw] = await Promise.all([
			getChangedFilesForDiff(git, [from, commitHash]),
			git.raw(["show", "-s", `--format=${format}`, commitHash]).catch(() => ""),
		]);
		const commit = parseCommitMetadata(metaRaw, commitHash);
		return { files, commit };
	},
});

/** Parse `git show -s --format=...` output into CommitMetadata. Fields before
 *  the body are single-token; the body (%B, last) may contain tabs and is split
 *  off by position so it survives intact. */
export function parseCommitMetadata(
	raw: string,
	fallbackHash: string,
): CommitMetadata | null {
	const line = raw.trim();
	if (!line) return null;
	const parts = line.split("\t");
	if (parts.length < 6) return null;
	const [hash, shortHash, parentsRaw, author, authorEmail, date] = parts;
	return {
		hash: hash || fallbackHash,
		shortHash: shortHash || fallbackHash.slice(0, 7),
		parents: parentsRaw ? parentsRaw.split(" ").filter(Boolean) : [],
		author: author ?? "",
		authorEmail: authorEmail ?? "",
		date: date ?? "",
		message: parts.slice(6).join("\t").trim(),
	};
}

export const gitWorkspaceRefsTask = defineWorkerTask<
	{ worktreePath: string; gitEnv: GitTaskEnv },
	WorkspaceRefsSnapshot
>({
	type: "git/readWorkspaceRefs",
	handler: async ({ worktreePath, gitEnv }) => {
		const git = createUserSimpleGit(worktreePath).env(gitEnv);
		return readWorkspaceRefs(git);
	},
});

export const gitIdentityTask = defineWorkerTask<
	{ shellEnv: GitTaskEnv },
	ResolvedGitInfo
>({
	type: "git/readGitIdentity",
	handler: ({ shellEnv }) => readGitIdentity(shellEnv),
});

// Delete-preview + destroy-preflight state for workspace cleanup.
// Unpushed-commit detection uses `rev-list --not --remotes` so brand-new
// branches with no upstream still report unpushed commits correctly.
export const gitWorktreeStateTask = defineWorkerTask<
	{
		worktreePath: string;
		gitEnv: GitTaskEnv;
		// Session repos have no remote, so `--not --remotes` counts every
		// commit and the initial scaffold commit would read as "unpushed"
		// forever. This treats exactly one commit as the empty baseline.
		ignoreInitialCommit?: boolean;
	},
	{ hasChanges: boolean; hasUnpushedCommits: boolean }
>({
	type: "git/worktreeState",
	handler: async ({ worktreePath, gitEnv, ignoreInitialCommit }) => {
		const git = createUserSimpleGit(worktreePath).env(gitEnv);
		const status = await git.status();
		let hasUnpushedCommits = false;
		try {
			const result = await git.raw([
				"rev-list",
				"--count",
				"HEAD",
				"--not",
				"--remotes",
			]);
			const count = Number.parseInt(result.trim(), 10);
			hasUnpushedCommits =
				Number.isFinite(count) && count > (ignoreInitialCommit ? 1 : 0);
		} catch {
			// Leave false — `rev-list` failure isn't a signal we can act on.
		}
		return { hasChanges: !status.isClean(), hasUnpushedCommits };
	},
});

export const gitWorktreeRemoveTask = defineWorkerTask<
	{ repoPath: string; worktreePath: string; gitEnv: GitTaskEnv },
	{ stillRegistered: boolean }
>({
	type: "git/removeWorktree",
	handler: async ({ repoPath, worktreePath, gitEnv }) => {
		const git = createUserSimpleGit(repoPath).env(gitEnv);
		// Remove against git's canonical path so a symlinked stored path
		// (macOS `/var` → `/private/var`) still matches its registration.
		const target = normalizeWorktreePath(worktreePath);
		// Best-effort: the registry read below is authoritative, not the
		// command's locale- and version-dependent exit text. `--force --force`
		// also unregisters a worktree whose directory is already gone, so no
		// separate prune (which would clobber other stale worktrees' metadata)
		// is needed.
		await git
			.raw(["worktree", "remove", "--force", "--force", target])
			.catch(() => {});
		// A `worktree list` failure throws out of the task: the post-remove
		// state is unknown and the caller must not treat it as removed.
		const raw = await git.raw(["worktree", "list", "--porcelain"]);
		return {
			stillRegistered: parseWorktreeList(raw).some(
				(w) => normalizeWorktreePath(w.path) === target,
			),
		};
	},
});

export const gitDeleteBranchTask = defineWorkerTask<
	{ repoPath: string; branch: string; gitEnv: GitTaskEnv },
	{ deleted: boolean }
>({
	type: "git/deleteLocalBranch",
	handler: async ({ repoPath, branch, gitEnv }) => {
		const git = createUserSimpleGit(repoPath).env(gitEnv);
		// `branch --list` exits 0 whether or not the branch exists (empty
		// output when absent), so an absent ref — renamed, pruned, or never
		// materialized — already satisfies the goal, while a thrown failure
		// propagates instead of being misread as "already deleted".
		const listed = await git.raw(["branch", "--list", branch]);
		if (listed.trim().length === 0) return { deleted: false };
		await git.raw(["branch", "-D", branch]);
		return { deleted: true };
	},
});

/**
 * Collect the raw topology material for git.listGraph, at any `refScope`.
 * Every git spawn lives here so the event loop is freed during traversal;
 * the tRPC coordinator joins `worktrees` against DB workspace rows to compute
 * ref `state` (workers cannot touch the DB).
 *
 * Spawns: for-each-ref (heads/remotes/tags), worktree list, rev-parse HEAD,
 * base-resolution helpers (symbolic-ref/config), branch --merged, rev-list
 * --count, log. Each is tolerant of a missing base / unborn repo so a partial
 * repo state returns an empty window instead of a 500.
 */
export const gitGraphLogTask = defineWorkerTask<
	{
		worktreePath: string;
		baseBranch?: string;
		refScope: GraphRefScope;
		limit: number;
		skip: number;
		gitEnv: GitTaskEnv;
	},
	GraphLogTaskOutput
>({
	type: "git/graphLog",
	handler: async ({
		worktreePath,
		baseBranch,
		refScope,
		limit,
		skip,
		gitEnv,
	}) => {
		const git = createUserSimpleGit(worktreePath).env(gitEnv);

		const [refsRaw, worktreesRaw, headShaRaw] = await Promise.all([
			git
				.raw([
					"for-each-ref",
					"--format=%(objectname)%09%(refname)%09%(upstream)",
					"refs/heads/",
					"refs/remotes/",
					"refs/tags/",
				])
				.catch(() => ""),
			git.raw(["worktree", "list", "--porcelain"]).catch(() => ""),
			git.revparse(["HEAD"]).catch(() => ""),
		]);

		const parsedRefs = parseForEachRef(refsRaw);
		const worktrees = parseWorktreeList(worktreesRaw);
		const headSha = headShaRaw.trim();

		// Unborn repo: no commits to graph. Still return refs/worktrees so the
		// coordinator can decorate the empty state if ever needed.
		if (!headSha || !/^[0-9a-f]{7,}$/.test(headSha)) {
			return {
				commits: [],
				refs: parsedRefs.map((r) => ({
					sha: r.sha,
					name: r.name,
					type: r.type,
					fullRef: r.fullRef,
				})),
				worktrees,
				mergedBranches: [],
				totalCommits: 0,
			};
		}

		// Resolve + validate the base ref (it may name a remote that was never
		// fetched). A missing base means no "merged" classification and no base
		// tip, but the graph still renders.
		let baseRef: string | null = null;
		const base = await resolveBaseComparison(git, baseBranch).catch(() => null);
		if (base?.baseRef) {
			const verified = await git
				.raw(["rev-parse", "--verify", "--quiet", `${base.baseRef}^{commit}`])
				.catch(() => "");
			if (/^[0-9a-f]{7,}/.test(verified.trim())) baseRef = base.baseRef;
		}

		const mergedBranches =
			baseRef !== null
				? parseMergedBranches(
						await git
							.raw(["branch", "--merged", baseRef, "--format=%(refname)"])
							.catch(() => ""),
					)
				: [];

		// Upstream of the current branch only; consumed by the "local" scope
		// ("all" returns before reading it — `--all` already covers remotes).
		// Restricted to refs that exist in this repo so the tip set stays valid.
		const refFullSet = new Set(parsedRefs.map((r) => r.fullRef));
		const normWorktree = normalizeWorktreePath(worktreePath);
		const currentBranch =
			worktrees.find(
				(w) =>
					!w.detached &&
					!w.bare &&
					w.branch !== null &&
					normalizeWorktreePath(w.path) === normWorktree,
			)?.branch ?? null;
		const upstreamRefs: string[] = [];
		if (currentBranch) {
			const cur = parsedRefs.find(
				(r) => r.fullRef === `refs/heads/${currentBranch}`,
			);
			if (cur?.upstream && refFullSet.has(cur.upstream)) {
				upstreamRefs.push(cur.upstream);
			}
		}

		const tips = buildTipSet({
			scope: refScope,
			head: "HEAD",
			baseRef,
			localBranchRefs: parsedRefs
				.filter((r) => r.type === "branch")
				.map((r) => r.fullRef),
			// ponytail: "open workspaces" is read off `git worktree list`, not the
			// workspaces table — the worker has no DB and every Superset workspace
			// is a worktree. A worktree created outside Superset counts too; join
			// against DB rows in the coordinator if that ever matters.
			// Prunable is dropped here, not in `worktreeByBranch`: the coordinator
			// needs those entries to classify a branch `prunable`, but a worktree
			// whose directory is gone is not an open workspace.
			worktreeBranchRefs: [...worktreeByBranch(worktrees)]
				.filter(([, w]) => !w.prunable)
				.map(([branch]) => `refs/heads/${branch}`),
			detachedWorktreeHeads: worktrees
				.filter((w) => w.detached && !w.bare && w.head !== null)
				.map((w) => w.head as string),
			upstreamRefs,
		});

		const [logRaw, countRaw] = await Promise.all([
			git
				.raw([
					"log",
					"--topo-order",
					`--max-count=${limit + 1}`,
					`--skip=${skip}`,
					...tips,
					"--format=%H%x09%h%x09%P%x09%an%x09%ae%x09%aI%x09%s",
				])
				.catch(() => ""),
			git.raw(["rev-list", "--count", ...tips]).catch(() => ""),
		]);

		const commits = parseGraphLog(logRaw);
		const trimmed = countRaw.trim();
		const totalCommits = /^\d+$/.test(trimmed)
			? Number.parseInt(trimmed, 10)
			: null;

		const refs: GraphRefRecord[] = parsedRefs.map((r) => ({
			sha: r.sha,
			name: r.name,
			type: r.type,
			fullRef: r.fullRef,
		}));
		refs.push({ sha: headSha, name: "HEAD", type: "head", fullRef: "HEAD" });

		return { commits, refs, worktrees, mergedBranches, totalCommits };
	},
});

export const gitTasks = [
	gitStatusSnapshotTask,
	gitFetchBaseRefTask,
	gitCommitFilesTask,
	gitWorkspaceRefsTask,
	gitIdentityTask,
	gitWorktreeStateTask,
	gitWorktreeRemoveTask,
	gitDeleteBranchTask,
	gitGraphLogTask,
];
