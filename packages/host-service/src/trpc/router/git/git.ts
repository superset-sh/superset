import { readFile, rm } from "node:fs/promises";
import { isAbsolute, join, normalize, sep } from "node:path";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { pullRequests, workspaces } from "../../../db/schema";
import { createGitEnvResolver } from "../../../runtime/git";
import { createUserSimpleGit } from "../../../runtime/git/simple-git";
import type { HostServiceContext } from "../../../types";
import { getHostWorkerPool } from "../../../workers/host-worker-pool";
import {
	gitCommitFilesTask,
	gitFetchBaseRefTask,
	gitGraphLogTask,
	gitStatusSnapshotTask,
} from "../../../workers/tasks/git";
import { protectedProcedure, queryProcedure, router } from "../../index";
import { resolveGithubRepo } from "../workspace-creation/shared/project-helpers";
import {
	normalizeWorktreePath,
	type WorktreeRecord,
} from "../workspace-creation/shared/worktree-list";
import type {
	ChangedFile,
	CheckConclusionState,
	CheckRun,
	CheckStatusState,
	Commit,
	CommitMetadata,
	GraphCommit,
	GraphRef,
	GraphRefState,
	IssueComment,
	ListGraphResult,
	MergeableState,
	PullRequestReviewDecision,
	PullRequestReviewThread,
	PullRequestState,
} from "./types";
import { scheduleBaseRefFetch } from "./utils/base-ref-freshness";
import { gitConfigWrite } from "./utils/config-write";
import {
	getDefaultBranchName,
	resolveBaseComparison,
} from "./utils/git-helpers";
import { gitStatusRefreshLimiter } from "./utils/git-status-refresh-limiter";
import { worktreeByBranch } from "./utils/graph-log";
import {
	type GraphQLThreadsResult,
	parseGraphQLThreads,
	REVIEW_THREADS_QUERY,
} from "./utils/graphql";
import { resolveWorktreePath } from "./utils/resolve-worktree";

// Front-door cap for commit-file diffs. Statuses are admitted by
// gitStatusRefreshLimiter; without a cap here, a burst of distinct-commit
// diffs could occupy every pool worker ahead of limiter-admitted statuses.
const MAX_CONCURRENT_COMMIT_FILE_TASKS = 2;
let activeCommitFileTasks = 0;
const commitFileWaiters: (() => void)[] = [];
async function withCommitFilesSlot<T>(fn: () => Promise<T>): Promise<T> {
	if (activeCommitFileTasks >= MAX_CONCURRENT_COMMIT_FILE_TASKS) {
		await new Promise<void>((resolve) => commitFileWaiters.push(resolve));
	}
	activeCommitFileTasks++;
	try {
		return await fn();
	} finally {
		activeCommitFileTasks--;
		commitFileWaiters.shift()?.();
	}
}

// Identical requests share one slot AND one task — deduping outside the
// semaphore keeps same-commit bursts from consuming both cap slots or
// re-running a task that finished while they waited for a slot.
const inFlightCommitFiles = new Map<
	string,
	Promise<{ files: ChangedFile[]; commit: CommitMetadata | null }>
>();
function runCommitFilesDeduped(
	key: string,
	fn: () => Promise<{ files: ChangedFile[]; commit: CommitMetadata | null }>,
): Promise<{ files: ChangedFile[]; commit: CommitMetadata | null }> {
	const existing = inFlightCommitFiles.get(key);
	if (existing) return existing;
	const task = withCommitFilesSlot(fn).finally(() => {
		inFlightCommitFiles.delete(key);
	});
	inFlightCommitFiles.set(key, task);
	return task;
}

/** Credential env for a worker git task, resolved in-process (the provider
 * can't cross the thread boundary) and passed to the worker as plain data. */
function resolveGitTaskEnv(
	ctx: Pick<HostServiceContext, "credentials">,
	worktreePath: string,
): Promise<Record<string, string>> {
	return createGitEnvResolver(ctx.credentials)(worktreePath);
}

/**
 * Compute the state for a local-branch ref plus its worktree metadata. State
 * rules (local branches only; remote/tag/head carry `null`):
 *   - registered worktree git marks prunable (a deleted worktree directory is
 *     one: "gitdir file points to non-existent location") → prunable
 *   - registered worktree, matching workspaces row → open
 *   - registered worktree, no row → detached-worktree
 *   - no worktree, contained in base → merged
 *   - no worktree, not contained → orphan-branch
 *
 * Containment comes from `git branch --merged <baseRef>` (reachable from the
 * base), NOT graph topology — a branch merged before the commit window still
 * reports "merged".
 */
function branchRefState(
	fullRef: string,
	name: string,
	branchWorktree: Map<string, WorktreeRecord>,
	workspaceByPath: Map<string, string>,
	mergedSet: Set<string>,
): Pick<
	GraphRef,
	"state" | "worktreePath" | "worktreeWorkspaceId" | "pruneReason"
> {
	const wt = branchWorktree.get(name);
	if (wt) {
		// `git worktree list --porcelain` already flags a missing directory, so
		// this no longer stats every branch's worktree on the main thread.
		if (wt.prunable) {
			return {
				state: "prunable",
				pruneReason: wt.prunable.reason || "worktree path missing",
			};
		}
		const wsId = workspaceByPath.get(normalizeWorktreePath(wt.path));
		if (wsId) {
			return {
				state: "open",
				worktreeWorkspaceId: wsId,
				worktreePath: wt.path,
			};
		}
		return { state: "detached-worktree", worktreePath: wt.path };
	}
	const state: GraphRefState = mergedSet.has(fullRef)
		? "merged"
		: "orphan-branch";
	return { state };
}

function assertSafeRelativePath(filePath: string): void {
	if (isAbsolute(filePath)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Absolute paths are not allowed",
		});
	}
	const normalized = normalize(filePath);
	if (normalized.split(sep).includes("..")) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Path traversal is not allowed",
		});
	}
	if (normalized === "" || normalized === ".") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Cannot target worktree root",
		});
	}
}

/**
 *  Hash-shaped revisions only. These reach `git show`/`git diff` positionally,
 *  and git reads a leading `-` as an option — `--output=<path>` on `git show`
 *  writes an arbitrary file. Callers only ever send real hashes.
 */
const commitHashSchema = z
	.string()
	.regex(/^[0-9a-f]{4,40}$/i, "Invalid commit hash");

export const gitRouter = router({
	listBranches: queryProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);

			// `%(HEAD)` emits "*" for the checked-out branch, " " otherwise.
			// Single spawn — independent of branch count. Only `name`/`isHead`
			// are read by the v2 sidebar's BaseBranchSelector; the other
			// per-branch fields the previous implementation computed (upstream,
			// ahead/behind, last-commit) cost 4 spawns each and were unused.
			let branches: { name: string; isHead: boolean }[] = [];
			try {
				const raw = await git.raw([
					"for-each-ref",
					"refs/heads/",
					"--format=%(HEAD)\t%(refname:short)",
				]);
				branches = raw
					.trim()
					.split("\n")
					.filter(Boolean)
					.map((line) => {
						const tab = line.indexOf("\t");
						if (tab < 0) return { name: line, isHead: false };
						return {
							isHead: line.slice(0, tab) === "*",
							name: line.slice(tab + 1),
						};
					});
			} catch {}

			return { branches };
		}),

	getStatus: queryProcedure
		.meta({ timeoutMs: 15_000 })
		.input(
			z.object({
				workspaceId: z.string(),
				baseBranch: z.string().optional(),
				priority: z.enum(["foreground", "background"]).optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const requestKey = JSON.stringify({
				baseBranch: input.baseBranch ?? null,
			});
			return gitStatusRefreshLimiter.run({
				workspaceId: input.workspaceId,
				requestKey,
				priority: input.priority,
				run: async () => {
					const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
					const gitEnv = await resolveGitTaskEnv(ctx, worktreePath);
					const workerPool = getHostWorkerPool();
					const result = await workerPool.run(
						gitStatusSnapshotTask,
						{ worktreePath, baseBranch: input.baseBranch, gitEnv },
						{ timeoutMs: 15_000 },
					);
					if (result.baseRefFetchTarget) {
						const target = result.baseRefFetchTarget;
						const coordinatorGit =
							createUserSimpleGit(worktreePath).env(gitEnv);
						// The coordinator maps live in this process, not in individual
						// workers, so worktrees sharing one common Git dir share one TTL
						// and in-flight fetch. The network fetch itself remains off-loop.
						scheduleBaseRefFetch(coordinatorGit, worktreePath, target, () =>
							workerPool.run(
								gitFetchBaseRefTask,
								{ worktreePath, target, gitEnv },
								{
									timeoutMs: 30_000,
									strategy: "coalesce",
									dedupeKey: `${worktreePath}:base-ref:${target.remote}/${target.branch}`,
								},
							),
						);
					}
					return result.snapshot;
				},
			});
		}),

	listCommits: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(
			z.object({
				workspaceId: z.string(),
				baseBranch: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);

			const base = await resolveBaseComparison(git, input.baseBranch);
			const baseRef = base?.baseRef ?? "HEAD";

			const commits: Commit[] = [];
			try {
				const raw = await git.raw([
					"log",
					`${baseRef}..HEAD`,
					"--format=%H\t%h\t%s\t%an\t%ae\t%aI",
				]);
				for (const line of raw.trim().split("\n")) {
					if (!line) continue;
					const [hash, shortHash, message, author, authorEmail, date] =
						line.split("\t");
					commits.push({
						hash: hash ?? "",
						shortHash: shortHash ?? "",
						message: message ?? "",
						author: author ?? "",
						authorEmail: authorEmail ?? "",
						date: date ?? "",
					});
				}
			} catch {}

			return { commits };
		}),

	listGraph: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(
			z.object({
				workspaceId: z.string(),
				baseBranch: z.string().optional(),
				refScope: z
					.enum(["local", "open-workspaces", "remote", "all", "head"])
					.default("local"),
				limit: z.number().int().min(1).max(2000).default(500),
				cursor: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			// Fetch the workspace row once for both path and projectId (sibling
			// workspaces share the project's git dir).
			const workspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();
			if (!workspace?.worktreePath) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}
			const worktreePath = workspace.worktreePath;

			// The cursor carries the scope it was issued for: `--skip` counts rows
			// of one traversal, so replaying a local offset against `head` would
			// window a list that never had those rows. A foreign cursor restarts
			// at 0 rather than serving a silently wrong page.
			let skip = 0;
			if (input.cursor) {
				const m = /^skip:(\d+):([a-z-]+)$/.exec(input.cursor);
				if (m && m[2] === input.refScope) {
					skip = Number.parseInt(m[1] ?? "0", 10);
				}
			}

			const gitEnv = await resolveGitTaskEnv(ctx, worktreePath);
			const result = await getHostWorkerPool().run(
				gitGraphLogTask,
				{
					worktreePath,
					baseBranch: input.baseBranch,
					refScope: input.refScope,
					limit: input.limit,
					skip,
					gitEnv,
				},
				// ~9 git spawns per call, all in the worker. A `git:changed` storm
				// during a rebase would fan those out badly; coalesce overlapping
				// calls for the same workspace onto one in-flight traversal.
				{
					timeoutMs: 30_000,
					strategy: "coalesce",
					// Every traversal input is part of the key. Two calls that differ
					// in scope, base, window size or offset are two different
					// traversals, and coalescing them serves one the other's rows —
					// `baseBranch` alone decides the `merged` classification, and the
					// base resolves a tick after mount, so the first two calls of a
					// cold open genuinely differ.
					dedupeKey: `${input.workspaceId}:graph-log:${input.refScope}:${input.baseBranch ?? ""}:${input.limit}:${skip}`,
				},
			);

			const fetched = result.commits;
			const hasMore = fetched.length > input.limit;
			const window = hasMore ? fetched.slice(0, input.limit) : fetched;
			const nextCursor = hasMore
				? `skip:${skip + input.limit}:${input.refScope}`
				: null;

			// The worker can't touch the DB, so the path→workspaceId join that
			// backs the "open" / "detached-worktree" states lives here.
			const siblings = ctx.db.query.workspaces
				.findMany({ where: eq(workspaces.projectId, workspace.projectId) })
				.sync();
			const workspaceByPath = new Map<string, string>();
			for (const w of siblings) {
				workspaceByPath.set(normalizeWorktreePath(w.worktreePath), w.id);
			}

			const refsBySha = new Map<string, typeof result.refs>();
			for (const r of result.refs) {
				const list = refsBySha.get(r.sha);
				if (list) list.push(r);
				else refsBySha.set(r.sha, [r]);
			}

			const branchWorktree = worktreeByBranch(result.worktrees);
			const mergedSet = new Set(result.mergedBranches);

			const commits: GraphCommit[] = window.map((c) => ({
				hash: c.hash,
				shortHash: c.shortHash,
				message: c.message,
				author: c.author,
				authorEmail: c.authorEmail,
				date: c.date,
				parents: c.parents,
				refs: (refsBySha.get(c.hash) ?? []).map((r): GraphRef => {
					if (r.type !== "branch") {
						return { name: r.name, type: r.type, state: null };
					}
					return {
						name: r.name,
						type: r.type,
						...branchRefState(
							r.fullRef,
							r.name,
							branchWorktree,
							workspaceByPath,
							mergedSet,
						),
					};
				}),
			}));

			const out: ListGraphResult = {
				commits,
				nextCursor,
				totalCommits: result.totalCommits,
			};
			return out;
		}),

	getCommitFiles: queryProcedure
		.meta({ timeoutMs: 15_000 })
		.input(
			z.object({
				workspaceId: z.string(),
				// `""` is the placeholder the renderer puts in a disabled query's
				// input while no commit is selected; it never reaches the wire.
				commitHash: commitHashSchema.or(z.literal("")),
				fromHash: commitHashSchema.optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const gitEnv = await resolveGitTaskEnv(ctx, worktreePath);
			const dedupeKey = `${input.workspaceId}:commit-files:${input.fromHash ?? ""}:${input.commitHash}`;
			const result = await runCommitFilesDeduped(dedupeKey, () =>
				getHostWorkerPool().run(
					gitCommitFilesTask,
					{
						worktreePath,
						commitHash: input.commitHash,
						fromHash: input.fromHash,
						gitEnv,
					},
					{
						timeoutMs: 15_000,
						strategy: "coalesce",
						dedupeKey,
					},
				),
			);

			return result;
		}),

	getBaseBranch: queryProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			const currentBranch = (
				await git.revparse(["--abbrev-ref", "HEAD"]).catch(() => "")
			).trim();
			if (!currentBranch || currentBranch === "HEAD") {
				return { baseBranch: null as string | null };
			}
			const configured = (
				await git
					.raw(["config", `branch.${currentBranch}.base`])
					.catch(() => "")
			).trim();
			return { baseBranch: (configured || null) as string | null };
		}),

	setBaseBranch: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				baseBranch: z.string().nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			const currentBranch = (
				await git.revparse(["--abbrev-ref", "HEAD"]).catch(() => "")
			).trim();
			if (!currentBranch || currentBranch === "HEAD") {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Cannot set base branch on detached HEAD",
				});
			}
			if (input.baseBranch) {
				await gitConfigWrite(git, [
					"config",
					`branch.${currentBranch}.base`,
					input.baseBranch,
				]);
			} else {
				await gitConfigWrite(git, [
					"config",
					"--unset",
					`branch.${currentBranch}.base`,
				]).catch(() => {});
			}
			return { baseBranch: input.baseBranch };
		}),

	renameBranch: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				oldName: z.string(),
				newName: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);

			// Check if branch has been pushed to remote
			try {
				const remote = await git.raw([
					"ls-remote",
					"--heads",
					"origin",
					input.oldName,
				]);
				if (remote.trim()) {
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: "Cannot rename a branch that has been pushed to remote",
					});
				}
			} catch (error) {
				if (error instanceof TRPCError) throw error;
				// ls-remote failed — probably no remote, safe to rename
			}

			await git.raw(["branch", "-m", input.oldName, input.newName]);
			return { name: input.newName };
		}),

	discardChanges: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				filePath: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertSafeRelativePath(input.filePath);
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			const status = await git.status();
			const isUntracked = status.not_added.includes(input.filePath);
			if (isUntracked) {
				await rm(join(worktreePath, input.filePath), { force: true });
			} else {
				await git.raw(["checkout", "HEAD", "--", input.filePath]);
			}
			return { success: true };
		}),

	discardAllUnstaged: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			await git.raw(["checkout", "--", "."]);
			await git.raw(["clean", "-fd"]);
			return { success: true };
		}),

	discardAllStaged: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			const status = await git.status();

			// Files with a staged change (index entry differs from HEAD).
			const stagedFiles = status.files.filter(
				(f) => f.index !== " " && f.index !== "?",
			);

			const checkoutHeadPaths: string[] = [];
			const resetPaths: string[] = [];
			const deletePaths: string[] = [];

			for (const f of stagedFiles) {
				if (f.index === "A") {
					// Staged-as-added: not in HEAD. Unstage + delete.
					resetPaths.push(f.path);
					deletePaths.push(f.path);
				} else if (f.index === "R") {
					// Staged rename: index has both delete-of-old and add-of-new.
					// Unstage both ends, restore old from HEAD, delete new.
					resetPaths.push(f.path);
					deletePaths.push(f.path);
					if (f.from) {
						resetPaths.push(f.from);
						checkoutHeadPaths.push(f.from);
					}
				} else if (f.index === "C") {
					// Staged copy: source unchanged, dest is new in index.
					resetPaths.push(f.path);
					deletePaths.push(f.path);
				} else {
					// M, D, T: exists in HEAD; checkout reverts both index and WT.
					checkoutHeadPaths.push(f.path);
				}
			}

			if (resetPaths.length > 0) {
				await git.raw(["reset", "HEAD", "--", ...resetPaths]);
			}
			if (checkoutHeadPaths.length > 0) {
				await git.raw(["checkout", "HEAD", "--", ...checkoutHeadPaths]);
			}
			for (const filePath of deletePaths) {
				await rm(join(worktreePath, filePath), { force: true });
			}
			return { success: true };
		}),

	stageAll: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			await git.raw(["add", "-A"]);
			return { success: true };
		}),

	unstageAll: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			await git.raw(["reset", "HEAD"]);
			return { success: true };
		}),

	getDiff: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(
			z.object({
				workspaceId: z.string(),
				path: z.string(),
				category: z.enum(["against-base", "staged", "unstaged", "commit"]),
				baseBranch: z.string().optional(),
				commitHash: commitHashSchema.optional(),
				fromHash: commitHashSchema.optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);

			let originalContent = "";
			let modifiedContent = "";

			if (input.category === "against-base") {
				const base = await resolveBaseComparison(git, input.baseBranch);
				const baseRef = base?.baseRef ?? "HEAD";
				// Use the merge base so the diff excludes unrelated changes
				// landed on the base branch after we forked — matches what the
				// file list (3-dot diff) is already filtered by.
				const originRef = await git
					.raw(["merge-base", baseRef, "HEAD"])
					.then((s) => s.trim())
					.catch(() => baseRef);
				try {
					originalContent = await git.show([`${originRef}:${input.path}`]);
				} catch {}
				try {
					modifiedContent = await git.show([`HEAD:${input.path}`]);
				} catch {}
			} else if (input.category === "staged") {
				try {
					originalContent = await git.show([`HEAD:${input.path}`]);
				} catch {}
				try {
					modifiedContent = await git.show([`:0:${input.path}`]);
				} catch {}
			} else if (input.category === "commit") {
				if (!input.commitHash) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "commitHash is required for commit diffs",
					});
				}
				const from = input.fromHash ?? `${input.commitHash}^`;
				try {
					originalContent = await git.show([`${from}:${input.path}`]);
				} catch {}
				try {
					modifiedContent = await git.show([
						`${input.commitHash}:${input.path}`,
					]);
				} catch {}
			} else {
				// Unstaged: compare index (staged version) against working tree
				// If file isn't in index (untracked), originalContent stays empty = "new file"
				try {
					originalContent = await git.show([`:0:${input.path}`]);
				} catch {}
				try {
					modifiedContent = await readFile(
						`${worktreePath}/${input.path}`,
						"utf-8",
					);
				} catch {}
			}

			const fileName = input.path.split("/").pop() ?? input.path;
			return {
				oldFile: { name: fileName, contents: originalContent },
				newFile: { name: fileName, contents: modifiedContent },
			};
		}),

	getBranchSyncStatus: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(z.object({ workspaceId: z.string() }))
		.query(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);

			const currentBranch = (
				await git.revparse(["--abbrev-ref", "HEAD"]).catch(() => "")
			).trim();
			const isDetached = !currentBranch || currentBranch === "HEAD";

			const defaultBranch = await getDefaultBranchName(git);
			const isDefaultBranch =
				!isDetached && !!defaultBranch && currentBranch === defaultBranch;

			const remotes = await git.getRemotes(false).catch(() => []);
			const hasRepo = remotes.length > 0;

			let hasUpstream = false;
			let pushCount = 0;
			let pullCount = 0;
			try {
				await git.raw(["rev-parse", "--abbrev-ref", "@{upstream}"]);
				hasUpstream = true;
				const tracking = await git.raw([
					"rev-list",
					"--left-right",
					"--count",
					"@{upstream}...HEAD",
				]);
				const [pullStr, pushStr] = tracking.trim().split(/\s+/);
				pullCount = Number.parseInt(pullStr || "0", 10);
				pushCount = Number.parseInt(pushStr || "0", 10);
			} catch {
				// no upstream — counts stay zero
			}

			// Read working-tree status separately from branch info so a transient
			// `git status` failure (e.g. lock contention during a concurrent
			// operation) doesn't poison the whole sync read. Log on failure so it
			// isn't silent — `hasUncommitted` defaults to false in that case
			// because over-reporting "uncommitted" on every blip is more annoying
			// than under-reporting briefly until the next refetch.
			let hasUncommitted = false;
			try {
				const status = await git.status();
				hasUncommitted = status.files.length > 0;
			} catch (error) {
				console.warn(
					"[git/getBranchSyncStatus] git.status() failed; treating working tree as clean for this read",
					error,
				);
			}

			return {
				hasRepo,
				hasUpstream,
				pushCount,
				pullCount,
				isDefaultBranch,
				isDetached,
				hasUncommitted,
				currentBranch: isDetached ? null : currentBranch,
				defaultBranch,
			};
		}),

	getPullRequest: queryProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(({ ctx, input }) => {
			const workspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();
			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}
			if (!workspace.pullRequestId) return null;

			const pr = ctx.db.query.pullRequests
				.findFirst({ where: eq(pullRequests.id, workspace.pullRequestId) })
				.sync();
			if (!pr) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Pull request ${workspace.pullRequestId} not found in database`,
				});
			}

			let checks: CheckRun[] = [];
			try {
				const parsed = JSON.parse(pr.checksJson);
				if (Array.isArray(parsed)) {
					checks = parsed.map(
						(c: Record<string, unknown>): CheckRun => ({
							name: (c.name as string) ?? "",
							status: ((c.status as string) ?? "completed") as CheckStatusState,
							conclusion: (c.conclusion ?? null) as CheckConclusionState | null,
							detailsUrl: (c.url as string) ?? null,
							startedAt: (c.startedAt as string) ?? null,
							completedAt: (c.completedAt as string) ?? null,
						}),
					);
				}
			} catch {}

			return {
				number: pr.prNumber,
				url: pr.url,
				title: pr.title,
				body: null as string | null,
				state: pr.state as PullRequestState,
				isDraft: pr.isDraft ?? false,
				reviewDecision: (pr.reviewDecision ??
					null) as PullRequestReviewDecision | null,
				mergeable: "unknown" as MergeableState,
				headRefName: pr.headBranch ?? "",
				updatedAt: pr.updatedAt ? new Date(pr.updatedAt).toISOString() : "",
				checks,
				repoOwner: pr.repoOwner,
				repoName: pr.repoName,
			};
		}),

	getCheckJobLogs: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(z.object({ workspaceId: z.string(), detailsUrl: z.string() }))
		.query(async ({ ctx, input }) => {
			const workspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();
			if (!workspace?.pullRequestId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace has no associated pull request",
				});
			}

			const pr = ctx.db.query.pullRequests
				.findFirst({ where: eq(pullRequests.id, workspace.pullRequestId) })
				.sync();
			if (!pr) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Pull request ${workspace.pullRequestId} not found in database`,
				});
			}

			// GitHub Actions check details URLs look like
			// https://github.com/<owner>/<repo>/actions/runs/<run_id>/job/<job_id>
			const isGithubUrl =
				URL.canParse(input.detailsUrl) &&
				new URL(input.detailsUrl).hostname === "github.com";
			const jobId = isGithubUrl
				? input.detailsUrl.match(/\/job\/(\d+)/)?.[1]
				: undefined;
			if (!jobId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Check is not a GitHub Actions job with downloadable logs",
				});
			}

			const octokit = await ctx.github();
			const { data } = await octokit.rest.actions.downloadJobLogsForWorkflowRun(
				{
					owner: pr.repoOwner,
					repo: pr.repoName,
					job_id: Number(jobId),
				},
			);
			return { logs: typeof data === "string" ? data : String(data) };
		}),

	getPullRequestThreads: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(z.object({ workspaceId: z.string() }))
		.query(async ({ ctx, input }) => {
			const workspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();
			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}
			if (!workspace.pullRequestId) {
				return { reviewThreads: [], conversationComments: [] };
			}

			const pr = ctx.db.query.pullRequests
				.findFirst({ where: eq(pullRequests.id, workspace.pullRequestId) })
				.sync();
			if (!pr) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Pull request ${workspace.pullRequestId} not found in database`,
				});
			}

			let repo: { owner: string; name: string };
			try {
				repo = await resolveGithubRepo(ctx, workspace.projectId);
			} catch (err) {
				// Expected resolver failures (project not set up locally, no
				// GitHub remote) degrade silently — the review tab just stays
				// empty. Anything else is a real bug; propagate it.
				if (err instanceof TRPCError) {
					return { reviewThreads: [], conversationComments: [] };
				}
				throw err;
			}

			const octokit = await ctx.github();

			let reviewThreads: PullRequestReviewThread[] = [];
			try {
				const result: GraphQLThreadsResult = await octokit.graphql(
					REVIEW_THREADS_QUERY,
					{
						owner: repo.owner,
						name: repo.name,
						prNumber: pr.prNumber,
					},
				);
				reviewThreads = parseGraphQLThreads(result);
			} catch (error) {
				console.warn(
					"[git.getPullRequestThreads] Failed to fetch review threads:",
					error,
				);
			}

			const conversationComments: IssueComment[] = [];
			try {
				let page = 1;
				let hasMore = true;
				while (hasMore) {
					const { data: comments } = await octokit.issues.listComments({
						owner: repo.owner,
						repo: repo.name,
						issue_number: pr.prNumber,
						per_page: 100,
						page,
					});
					for (const c of comments) {
						const body = c.body?.trim();
						if (!body) continue;
						conversationComments.push({
							id: c.id,
							user: {
								login: c.user?.login ?? "ghost",
								avatarUrl: c.user?.avatar_url ?? "",
							},
							body,
							createdAt: c.created_at ?? "",
							htmlUrl: c.html_url ?? "",
						});
					}
					hasMore = comments.length === 100;
					page++;
				}
			} catch (error) {
				console.warn(
					"[git.getPullRequestThreads] Failed to fetch conversation comments:",
					error,
				);
			}

			return { reviewThreads, conversationComments };
		}),

	setReviewThreadResolution: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				threadId: z.string(),
				resolved: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const workspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();
			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}

			const octokit = await ctx.github();
			const mutation = input.resolved
				? `mutation($threadId: ID!) {
					resolveReviewThread(input: {threadId: $threadId}) {
						thread { id isResolved }
					}
				}`
				: `mutation($threadId: ID!) {
					unresolveReviewThread(input: {threadId: $threadId}) {
						thread { id isResolved }
					}
				}`;

			try {
				await octokit.graphql(mutation, { threadId: input.threadId });
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "GraphQL mutation failed";
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
			}

			return { threadId: input.threadId, isResolved: input.resolved };
		}),
});
