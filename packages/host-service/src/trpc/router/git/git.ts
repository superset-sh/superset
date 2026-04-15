import { readFile } from "node:fs/promises";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { projects, pullRequests, workspaces } from "../../../db/schema";
import { protectedProcedure, router } from "../../index";
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
import {
	buildBranch,
	getChangedFilesForDiff,
	getDefaultBranchName,
	mapGitStatus,
	parseNumstat,
} from "./utils/git-helpers";
import {
	type GraphQLThreadsResult,
	parseGraphQLThreads,
	REVIEW_THREADS_QUERY,
} from "./utils/graphql";
import { resolveWorktreePath } from "./utils/resolve-worktree";

export const gitRouter = router({
	listBranches: protectedProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);

			const currentBranchName = (
				await git.revparse(["--abbrev-ref", "HEAD"]).catch(() => "")
			).trim();
			const defaultBranchName = await getDefaultBranchName(git);

			let branchNames: string[] = [];
			try {
				const raw = await git.raw([
					"branch",
					"--list",
					"--format=%(refname:short)",
				]);
				branchNames = raw.trim().split("\n").filter(Boolean);
			} catch {}

			const branches = await Promise.all(
				branchNames.map((name) =>
					buildBranch(
						git,
						name,
						name === currentBranchName,
						defaultBranchName ? `origin/${defaultBranchName}` : undefined,
					),
				),
			);

			return { branches };
		}),

	getStatus: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				baseBranch: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);

			const currentBranchName = (
				await git.revparse(["--abbrev-ref", "HEAD"]).catch(() => "")
			).trim();
			const defaultBranchName =
				input.baseBranch ?? (await getDefaultBranchName(git));
			const baseRef = defaultBranchName
				? `origin/${defaultBranchName}`
				: "HEAD";

			const [currentBranch, defaultBranch, status, ignoredRaw] =
				await Promise.all([
					buildBranch(git, currentBranchName, true, baseRef),
					defaultBranchName
						? buildBranch(git, defaultBranchName, false)
						: buildBranch(git, currentBranchName, true),
					git.status(),
					git
						.raw([
							"ls-files",
							"--others",
							"--ignored",
							"--exclude-standard",
							"--directory",
						])
						.catch(() => ""),
				]);

			// Top-level gitignored paths. `--directory` collapses entirely-ignored
			// folders to a single entry (e.g. `node_modules`) instead of
			// enumerating every file inside, so this stays cheap in large repos.
			const ignoredPaths = ignoredRaw
				.split("\n")
				.map((line) => line.trim().replace(/\/$/, ""))
				.filter(Boolean);

			const againstBase = await getChangedFilesForDiff(git, [baseRef, "HEAD"]);

			// Staged — use status.files index character for correct status
			const stagedNumstat = parseNumstat(
				await git.raw(["diff", "--numstat", "--cached"]).catch(() => ""),
			);
			const staged: ChangedFile[] = [];
			for (const file of status.files) {
				const idx = file.index;
				if (idx && idx !== " " && idx !== "?") {
					const stats = stagedNumstat.get(file.path) ?? {
						additions: 0,
						deletions: 0,
					};
					staged.push({
						path: file.path,
						status: mapGitStatus(idx),
						additions: stats.additions,
						deletions: stats.deletions,
					});
				}
			}

			// Unstaged — use status.files working_dir character
			const unstagedNumstat = parseNumstat(
				await git.raw(["diff", "--numstat"]).catch(() => ""),
			);
			const unstaged: ChangedFile[] = [];
			for (const file of status.files) {
				const wd = file.working_dir;
				if (file.index === "?" && wd === "?") {
					unstaged.push({
						path: file.path,
						status: "untracked",
						additions: 0,
						deletions: 0,
					});
				} else if (wd && wd !== " ") {
					const stats = unstagedNumstat.get(file.path) ?? {
						additions: 0,
						deletions: 0,
					};
					unstaged.push({
						path: file.path,
						status: mapGitStatus(wd),
						additions: stats.additions,
						deletions: stats.deletions,
					});
				}
			}

			return {
				currentBranch,
				defaultBranch,
				againstBase,
				staged,
				unstaged,
				ignoredPaths,
			};
		}),

	listCommits: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				baseBranch: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);

			const defaultBranchName =
				input.baseBranch ?? (await getDefaultBranchName(git));
			const baseRef = defaultBranchName
				? `origin/${defaultBranchName}`
				: "HEAD";

			const commits: Commit[] = [];
			try {
				const raw = await git.raw([
					"log",
					`${baseRef}..HEAD`,
					"--format=%H\t%h\t%s\t%an\t%aI",
				]);
				for (const line of raw.trim().split("\n")) {
					if (!line) continue;
					const [hash, shortHash, message, author, date] = line.split("\t");
					commits.push({
						hash: hash ?? "",
						shortHash: shortHash ?? "",
						message: message ?? "",
						author: author ?? "",
						date: date ?? "",
					});
				}
			} catch {}

			return { commits };
		}),

	getCommitFiles: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				commitHash: z.string(),
				fromHash: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);

			const from = input.fromHash ? input.fromHash : `${input.commitHash}^`;
			const files = await getChangedFilesForDiff(git, [from, input.commitHash]);

			return { files };
		}),

	getBaseBranch: protectedProcedure
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
				await git.raw([
					"config",
					`branch.${currentBranch}.base`,
					input.baseBranch,
				]);
			} else {
				await git
					.raw(["config", "--unset", `branch.${currentBranch}.base`])
					.catch(() => {});
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

	getDiff: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				path: z.string(),
				category: z.enum(["against-base", "staged", "unstaged", "commit"]),
				baseBranch: z.string().optional(),
				commitHash: z.string().optional(),
				fromHash: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const worktreePath = resolveWorktreePath(ctx, input.workspaceId);
			const git = await ctx.git(worktreePath);

			let originalContent = "";
			let modifiedContent = "";

			if (input.category === "against-base") {
				const baseBranch =
					input.baseBranch ?? (await getDefaultBranchName(git));
				const baseRef = baseBranch ? `origin/${baseBranch}` : "HEAD";
				try {
					originalContent = await git.show([`${baseRef}:${input.path}`]);
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

	getPullRequest: protectedProcedure
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
			};
		}),

	getPullRequestThreads: protectedProcedure
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

			const project = ctx.db.query.projects
				.findFirst({ where: eq(projects.id, workspace.projectId) })
				.sync();
			if (!project) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: `Project ${workspace.projectId} not found in database`,
				});
			}
			if (!project.repoOwner || !project.repoName) {
				return { reviewThreads: [], conversationComments: [] };
			}

			const octokit = await ctx.github();

			let reviewThreads: PullRequestReviewThread[] = [];
			try {
				const result: GraphQLThreadsResult = await octokit.graphql(
					REVIEW_THREADS_QUERY,
					{
						owner: project.repoOwner,
						name: project.repoName,
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
						owner: project.repoOwner,
						repo: project.repoName,
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
});
