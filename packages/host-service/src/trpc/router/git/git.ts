import { rm } from "node:fs/promises";
import { join } from "node:path";
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
	gitCommitTask,
	gitDiffBulkTask,
	gitDiffPatchTask,
	gitDiffSideBlobTask,
	gitFetchBaseRefTask,
	gitPushTask,
	gitStatusSnapshotTask,
} from "../../../workers/tasks/git";
import { protectedProcedure, queryProcedure, router } from "../../index";
import { resolveGithubRepo } from "../workspace-creation/shared/project-helpers";
import type {
	ChangedFile,
	CheckConclusionState,
	CheckRun,
	CheckStatusState,
	Commit,
	IssueComment,
	MergeableState,
	PullRequestReviewDecision,
	PullRequestReviewThread,
	PullRequestState,
} from "./types";
import { scheduleBaseRefFetch } from "./utils/base-ref-freshness";
import { rethrowEnvironmentalGitError } from "./utils/classify-git-error";
import { gitConfigWrite } from "./utils/config-write";
import {
	assertSafeRelativePath,
	getDefaultBranchName,
	loadFileDiffContent,
	resolveBaseComparison,
	resolveDiffCategoryRefs,
} from "./utils/git-helpers";
import { gitStatusRefreshLimiter } from "./utils/git-status-refresh-limiter";
import {
	type GraphQLThreadsResult,
	parseGraphQLThreads,
	REVIEW_THREADS_QUERY,
} from "./utils/graphql";
import { resolveWorktreePath } from "./utils/resolve-worktree";
import { attachSpawnFailureDiagnostics } from "./utils/spawn-failure-diagnostics";

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
const inFlightCommitFiles = new Map<string, Promise<ChangedFile[]>>();
function runCommitFilesDeduped(
	key: string,
	fn: () => Promise<ChangedFile[]>,
): Promise<ChangedFile[]> {
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

/** Delete for a discard. Recursive because an untracked or staged-as-added
 * path can be a directory (an embedded git repository is reported as one
 * entry, never expanded into files), and confined to the worktree because
 * assertSafeRelativePath runs on the caller-relative path first. */
async function removeFromWorktree(
	worktreePath: string,
	relativePath: string,
): Promise<void> {
	assertSafeRelativePath(relativePath);
	await rm(join(worktreePath, relativePath), { recursive: true, force: true });
}

/** Upper bound for one getDiffStatsByWorkspaces call — a page's host rarely
 * has more than a few dozen workspaces; anything larger is a runaway caller. */
export const MAX_DIFF_STATS_BATCH = 500;

/** Limiter-admitted status snapshot; shared by getStatus and the batched
 * diff-stats query so both see identical numbers for a workspace. */
function runStatusSnapshot(
	ctx: Parameters<typeof resolveWorktreePath>[0] &
		Pick<HostServiceContext, "credentials">,
	input: {
		workspaceId: string;
		baseBranch?: string;
		priority?: "foreground" | "background";
	},
) {
	const requestKey = JSON.stringify({ baseBranch: input.baseBranch ?? null });
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
				const coordinatorGit = createUserSimpleGit(worktreePath).env(gitEnv);
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
}

/** Same union the desktop Changes tab renders: staged/unstaged override the
 * against-base entry for a path, so totals match what the workspace shows. */
function sumSnapshotDiffStats(snapshot: {
	againstBase: ChangedFile[];
	staged: ChangedFile[];
	unstaged: ChangedFile[];
}): { additions: number; deletions: number; fileCount: number } {
	const byPath = new Map<string, ChangedFile>();
	for (const file of snapshot.againstBase) byPath.set(file.path, file);
	for (const file of snapshot.staged) byPath.set(file.path, file);
	for (const file of snapshot.unstaged) byPath.set(file.path, file);
	let additions = 0;
	let deletions = 0;
	for (const file of byPath.values()) {
		additions += file.additions;
		deletions += file.deletions;
	}
	return { additions, deletions, fileCount: byPath.size };
}

const getDiffInputShape = z.object({
	workspaceId: z.string(),
	path: z.string(),
	category: z.enum(["against-base", "staged", "unstaged", "commit"]),
	baseBranch: z.string().optional(),
	commitHash: z.string().optional(),
	fromHash: z.string().optional(),
});

/** Upper bound on one getDiffBulk call — generous headroom over the largest
 * changeset we expect the Changes pane to render, while still bounding a
 * runaway/malicious request. */
const MAX_DIFF_BULK_PATHS = 2000;
const DIFF_SIDE_FILE_MAX_BYTES = 10 * 1024 * 1024;

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
			try {
				return await runStatusSnapshot(ctx, input);
			} catch (error) {
				// The worker boundary strips prototypes, so a simple-git failure
				// arrives as a plain error — classify it by message here. The
				// worktree can vanish between resolveWorktreePath's existsSync
				// check and the git spawn.
				rethrowEnvironmentalGitError(error);
				// A spawn that never produced a process reports with no
				// first-party frame and no reason; record the descriptor table
				// while we are still standing in the failure.
				attachSpawnFailureDiagnostics(error);
				throw error;
			}
		}),

	// One request per host for list/board surfaces — totals only, so a
	// 30-workspace page never fans out 30 getStatus calls from the client.
	// The batch is bounded so one RPC can't queue unbounded background work;
	// callers slice to this cap (see useAccessibleV2Workspaces).
	getDiffStatsByWorkspaces: queryProcedure
		.meta({ timeoutMs: 60_000 })
		.input(
			z.object({ workspaceIds: z.array(z.string()).max(MAX_DIFF_STATS_BATCH) }),
		)
		.query(async ({ ctx, input }) => {
			const queue = [...input.workspaceIds];
			const workspaces: {
				workspaceId: string;
				additions: number;
				deletions: number;
				fileCount: number;
			}[] = [];
			// Small local cap; each status is additionally admitted by
			// gitStatusRefreshLimiter at background priority, so this batch can
			// never crowd out a foreground Changes-tab refresh.
			const workers = Array.from(
				{ length: Math.min(4, queue.length) },
				async () => {
					for (
						let workspaceId = queue.shift();
						workspaceId !== undefined;
						workspaceId = queue.shift()
					) {
						try {
							const snapshot = await runStatusSnapshot(ctx, {
								workspaceId,
								priority: "background",
							});
							workspaces.push({
								workspaceId,
								...sumSnapshotDiffStats(snapshot),
							});
						} catch {
							// Missing worktree, wedged repo, etc. — omit the row rather
							// than failing the whole batch.
						}
					}
				},
			);
			await Promise.all(workers);
			return { workspaces };
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

	getCommitFiles: queryProcedure
		.meta({ timeoutMs: 15_000 })
		.input(
			z.object({
				workspaceId: z.string(),
				commitHash: z.string(),
				fromHash: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const gitEnv = await resolveGitTaskEnv(ctx, worktreePath);
			const dedupeKey = `${input.workspaceId}:commit-files:${input.fromHash ?? ""}:${input.commitHash}`;
			const files = await runCommitFilesDeduped(dedupeKey, () =>
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

			return { files };
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
				await removeFromWorktree(worktreePath, input.filePath);
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
				await removeFromWorktree(worktreePath, filePath);
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

	commit: protectedProcedure
		// Commit hooks (lint-staged etc.) run here and can be slow.
		.meta({ timeoutMs: 60_000 })
		.input(
			z.object({
				workspaceId: z.string(),
				message: z.string().trim().min(1),
				stageAll: z.boolean().default(true),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const gitEnv = await resolveGitTaskEnv(ctx, worktreePath);
			const result = await getHostWorkerPool().run(
				gitCommitTask,
				{
					worktreePath,
					message: input.message,
					stageAll: input.stageAll,
					gitEnv,
				},
				{ timeoutMs: 60_000 },
			);
			if (!result.ok) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Nothing to commit",
				});
			}
			return { success: true, hash: result.hash };
		}),

	push: protectedProcedure
		.meta({ timeoutMs: 120_000 })
		.input(z.object({ workspaceId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			// The linked PR lookup stays on-loop (sync db reads); the git work
			// itself — upstream resolution and the push — runs in the pool.
			const workspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();
			const linkedPr = workspace?.pullRequestId
				? ctx.db.query.pullRequests
						.findFirst({ where: eq(pullRequests.id, workspace.pullRequestId) })
						.sync()
				: null;
			const gitEnv = await resolveGitTaskEnv(ctx, worktreePath);
			const result = await getHostWorkerPool().run(
				gitPushTask,
				{
					worktreePath,
					linkedPrHeadBranch: linkedPr?.headBranch ?? null,
					gitEnv,
				},
				{ timeoutMs: 120_000 },
			);
			if (!result.ok) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						result.reason === "detached-head"
							? "Cannot push with a detached HEAD"
							: "No git remote to push to",
				});
			}
			return { success: true };
		}),

	getDiff: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(getDiffInputShape)
		.query(async ({ ctx, input }) => {
			assertSafeRelativePath(input.path);
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);
			const refs = await resolveDiffCategoryRefs(git, input.category, input);
			return loadFileDiffContent(
				git,
				worktreePath,
				input.category,
				input.path,
				refs,
			);
		}),

	// One side of a binary file's diff, read from the git object the text
	// diff would compare (index, HEAD, merge-base or a commit) so an image or
	// PDF preview shows the same "before" and "after" as the hunks around it.
	// The unstaged "new" side is the working tree and is not served here;
	// callers read it through `filesystem.readFile`.
	readDiffSideFile: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(
			getDiffInputShape.extend({
				side: z.enum(["old", "new"]),
				maxBytes: z
					.number()
					.int()
					.positive()
					.max(DIFF_SIDE_FILE_MAX_BYTES)
					.optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			assertSafeRelativePath(input.path);
			if (input.category === "unstaged" && input.side === "new") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"The unstaged new side is the working tree, not a git object",
				});
			}
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const gitEnv = await resolveGitTaskEnv(ctx, worktreePath);
			return getHostWorkerPool().run(
				gitDiffSideBlobTask,
				{
					worktreePath,
					category: input.category,
					side: input.side,
					path: input.path,
					maxBytes: input.maxBytes ?? DIFF_SIDE_FILE_MAX_BYTES,
					baseBranch: input.baseBranch,
					commitHash: input.commitHash,
					fromHash: input.fromHash,
					gitEnv,
				},
				{ timeoutMs: 30_000 },
			);
		}),

	// Bulk sibling of `getDiff` for callers (the Changes pane) that need every
	// changed file's diff at once. One network round trip instead of one per
	// file, and the shared ref resolution (merge-base, etc.) below runs once
	// for the whole batch instead of once per file. Concurrency is bounded so
	// a several-hundred-file changeset doesn't spawn hundreds of simultaneous
	// `git show` processes.
	getDiffBulk: queryProcedure
		.meta({ timeoutMs: 60_000 })
		.input(
			z.object({
				workspaceId: z.string(),
				paths: z.array(z.string()).min(1).max(MAX_DIFF_BULK_PATHS),
				category: z.enum(["against-base", "staged", "unstaged", "commit"]),
				baseBranch: z.string().optional(),
				commitHash: z.string().optional(),
				fromHash: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			for (const path of input.paths) assertSafeRelativePath(path);
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const gitEnv = await resolveGitTaskEnv(ctx, worktreePath);
			// Ref resolution and every file's `git show` pair run inside the
			// worker task, off the host-service event loop — see
			// no-main-loop-blocking.test.ts.
			return getHostWorkerPool().run(
				gitDiffBulkTask,
				{
					worktreePath,
					paths: input.paths,
					category: input.category,
					baseBranch: input.baseBranch,
					commitHash: input.commitHash,
					fromHash: input.fromHash,
					gitEnv,
				},
				{ timeoutMs: 60_000 },
			);
		}),

	// Patch-shaped sibling of `getDiff`: one `git diff` for a whole category
	// instead of two `git show` blobs per file. The renderer parses it into
	// per-file metadata and calls `getDiff` later, only for the files somebody
	// expands or edits — so an untouched changeset never moves whole files.
	getDiffPatch: queryProcedure
		.meta({ timeoutMs: 60_000 })
		.input(
			z.object({
				workspaceId: z.string(),
				category: z.enum(["against-base", "staged", "unstaged", "commit"]),
				paths: z.array(z.string()).max(MAX_DIFF_BULK_PATHS).optional(),
				untrackedPaths: z.array(z.string()).max(MAX_DIFF_BULK_PATHS).optional(),
				baseBranch: z.string().optional(),
				commitHash: z.string().optional(),
				fromHash: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			for (const path of input.paths ?? []) assertSafeRelativePath(path);
			for (const path of input.untrackedPaths ?? [])
				assertSafeRelativePath(path);
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const gitEnv = await resolveGitTaskEnv(ctx, worktreePath);
			return getHostWorkerPool().run(
				gitDiffPatchTask,
				{
					worktreePath,
					category: input.category,
					paths: input.paths,
					untrackedPaths: input.untrackedPaths,
					baseBranch: input.baseBranch,
					commitHash: input.commitHash,
					fromHash: input.fromHash,
					gitEnv,
				},
				{ timeoutMs: 60_000 },
			);
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

			// Session workspaces (null projectId) have no GitHub remote.
			if (workspace.projectId === null) {
				return { reviewThreads: [], conversationComments: [] };
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
