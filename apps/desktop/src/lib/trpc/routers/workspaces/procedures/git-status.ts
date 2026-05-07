import { existsSync } from "node:fs";
import type { GitHubStatus } from "@superset/local-db";
import { workspaces, worktrees } from "@superset/local-db";
import { and, eq, isNull } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import {
	getProject,
	getWorkspace,
	getWorktree,
	updateProjectDefaultBranch,
} from "../utils/db-helpers";
import {
	fetchDefaultBranch,
	getAheadBehindCount,
	getDefaultBranch,
	listExternalWorktrees,
	refreshDefaultBranch,
} from "../utils/git";
import {
	clearGitHubCachesForWorktree,
	fetchGitHubPRComments,
	fetchGitHubPRStatus,
	type PullRequestCommentsTarget,
	resolveReviewThread,
} from "../utils/github";
import { selectExternalWorktreesForImport } from "../utils/select-external-worktrees-for-import";
import { getWorkspacePath } from "../utils/worktree";

const gitHubPRCommentsInputSchema = z.object({
	workspaceId: z.string(),
	prNumber: z.number().int().positive().optional(),
	repoUrl: z.string().optional(),
	upstreamUrl: z.string().optional(),
	isFork: z.boolean().optional(),
});

function resolveCommentsPullRequestTarget({
	input,
	githubStatus,
}: {
	input: z.infer<typeof gitHubPRCommentsInputSchema>;
	githubStatus: GitHubStatus | null | undefined;
}): PullRequestCommentsTarget | null {
	const prNumber = input.prNumber ?? githubStatus?.pr?.number;
	if (!prNumber) {
		return null;
	}

	const repoUrl = input.repoUrl ?? githubStatus?.repoUrl;
	if (!repoUrl) {
		return null;
	}

	const upstreamUrl =
		input.upstreamUrl ?? githubStatus?.upstreamUrl ?? githubStatus?.repoUrl;
	if (!upstreamUrl) {
		return null;
	}

	return {
		prNumber,
		repoContext: {
			repoUrl,
			upstreamUrl,
			isFork: input.isFork ?? githubStatus?.isFork ?? false,
		},
	};
}

function stripGitHubStatusTimestamp(
	status: GitHubStatus | null | undefined,
): Omit<GitHubStatus, "lastRefreshed"> | null {
	if (!status) {
		return null;
	}

	const { lastRefreshed: _lastRefreshed, ...rest } = status;
	return rest;
}

function hasMeaningfulGitHubStatusChange({
	current,
	next,
}: {
	current: GitHubStatus | null | undefined;
	next: GitHubStatus;
}): boolean {
	return (
		JSON.stringify(stripGitHubStatusTimestamp(current)) !==
		JSON.stringify(stripGitHubStatusTimestamp(next))
	);
}

export const createGitStatusProcedures = () => {
	return router({
		refreshGitStatus: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.mutation(async ({ input }) => {
				const workspace = getWorkspace(input.workspaceId);
				if (!workspace) {
					throw new Error(`Workspace ${input.workspaceId} not found`);
				}

				const repoPath = getWorkspacePath(workspace);
				if (!repoPath) {
					throw new Error(
						`Could not resolve path for workspace ${input.workspaceId}`,
					);
				}

				const project = getProject(workspace.projectId);
				if (!project) {
					throw new Error(`Project ${workspace.projectId} not found`);
				}

				const remoteDefaultBranch = await refreshDefaultBranch(
					project.mainRepoPath,
				);

				let defaultBranch = project.defaultBranch;
				if (!defaultBranch) {
					defaultBranch = await getDefaultBranch(project.mainRepoPath);
				}
				if (remoteDefaultBranch && remoteDefaultBranch !== defaultBranch) {
					defaultBranch = remoteDefaultBranch;
				}

				if (defaultBranch !== project.defaultBranch) {
					updateProjectDefaultBranch(project.id, defaultBranch);
				}

				await fetchDefaultBranch(project.mainRepoPath, defaultBranch);

				const { ahead, behind } = await getAheadBehindCount({
					repoPath,
					defaultBranch,
				});

				const gitStatus = {
					branch: workspace.branch,
					needsRebase: behind > 0,
					ahead,
					behind,
					lastRefreshed: Date.now(),
				};

				if (workspace.worktreeId) {
					localDb
						.update(worktrees)
						.set({ gitStatus })
						.where(eq(worktrees.id, workspace.worktreeId))
						.run();
				}

				return { gitStatus, defaultBranch };
			}),

		getAheadBehind: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(async ({ input }) => {
				const workspace = getWorkspace(input.workspaceId);
				if (!workspace) {
					return { ahead: 0, behind: 0 };
				}

				const project = getProject(workspace.projectId);
				if (!project) {
					return { ahead: 0, behind: 0 };
				}

				return getAheadBehindCount({
					repoPath: project.mainRepoPath,
					defaultBranch: workspace.branch,
				});
			}),

		getGitHubStatus: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(async ({ input }) => {
				const workspace = getWorkspace(input.workspaceId);
				if (!workspace) {
					return null;
				}

				const repoPath = getWorkspacePath(workspace);
				if (!repoPath) {
					return null;
				}

				const branchOverride =
					workspace.type === "branch" ? workspace.branch : null;

				const freshStatus = await fetchGitHubPRStatus(repoPath, branchOverride);

				if (freshStatus && workspace.worktreeId) {
					const worktree = getWorktree(workspace.worktreeId);
					if (
						worktree &&
						hasMeaningfulGitHubStatusChange({
							current: worktree.githubStatus,
							next: freshStatus,
						})
					) {
						localDb
							.update(worktrees)
							.set({ githubStatus: freshStatus })
							.where(eq(worktrees.id, workspace.worktreeId))
							.run();
					}
				}

				return freshStatus;
			}),

		getGitHubPRComments: publicProcedure
			.input(gitHubPRCommentsInputSchema)
			.query(async ({ input }) => {
				const workspace = getWorkspace(input.workspaceId);
				if (!workspace) {
					return [];
				}

				const repoPath = getWorkspacePath(workspace);
				if (!repoPath) {
					return [];
				}

				const worktree = workspace.worktreeId
					? getWorktree(workspace.worktreeId)
					: null;
				const cachedGitHubStatus = worktree?.githubStatus ?? null;

				return fetchGitHubPRComments({
					worktreePath: repoPath,
					pullRequest: resolveCommentsPullRequestTarget({
						input,
						githubStatus: cachedGitHubStatus,
					}),
					branchName: workspace.type === "branch" ? workspace.branch : null,
				});
			}),

		resolveReviewThread: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					threadId: z.string(),
					resolve: z.boolean(),
				}),
			)
			.mutation(async ({ input }) => {
				const workspace = getWorkspace(input.workspaceId);
				if (!workspace) {
					throw new Error(`Workspace ${input.workspaceId} not found`);
				}

				const repoPath = getWorkspacePath(workspace);
				if (!repoPath) {
					throw new Error(
						`Could not resolve path for workspace ${input.workspaceId}`,
					);
				}

				await resolveReviewThread({
					worktreePath: repoPath,
					threadId: input.threadId,
					resolve: input.resolve,
				});

				clearGitHubCachesForWorktree(repoPath);
			}),

		getWorktreeInfo: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(({ input }) => {
				const workspace = getWorkspace(input.workspaceId);
				if (!workspace) {
					return null;
				}

				if (workspace.type === "branch") {
					return {
						worktreeName: workspace.name,
						branchName: workspace.branch,
						createdAt: workspace.createdAt,
						gitStatus: null,
						githubStatus: null,
					};
				}

				const worktree = workspace.worktreeId
					? getWorktree(workspace.worktreeId)
					: null;
				if (!worktree) {
					return null;
				}

				const worktreeName = worktree.path.split("/").pop() ?? worktree.branch;
				const branchName = worktree.branch;

				return {
					worktreeName,
					branchName,
					createdAt: worktree.createdAt,
					gitStatus: worktree.gitStatus ?? null,
					githubStatus: worktree.githubStatus ?? null,
				};
			}),

		getWorktreesByProject: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(({ input }) => {
				const projectWorktrees = localDb
					.select()
					.from(worktrees)
					.where(eq(worktrees.projectId, input.projectId))
					.all();

				return projectWorktrees.map((wt) => {
					const workspace = localDb
						.select()
						.from(workspaces)
						.where(
							and(
								eq(workspaces.worktreeId, wt.id),
								isNull(workspaces.deletingAt),
							),
						)
						.get();
					return {
						...wt,
						hasActiveWorkspace: workspace !== undefined,
						existsOnDisk: existsSync(wt.path),
						workspace: workspace ?? null,
					};
				});
			}),

		getExternalWorktrees: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(async ({ input }) => {
				const project = getProject(input.projectId);
				if (!project) {
					return [];
				}

				const allWorktrees = await listExternalWorktrees(project.mainRepoPath);

				const trackedWorktrees = localDb
					.select({ path: worktrees.path })
					.from(worktrees)
					.where(eq(worktrees.projectId, input.projectId))
					.all();
				const trackedPaths = new Set(trackedWorktrees.map((wt) => wt.path));

				return selectExternalWorktreesForImport(allWorktrees, {
					mainRepoPath: project.mainRepoPath,
					trackedPaths,
				}).map((wt) => ({
					path: wt.path,
					// biome-ignore lint/style/noNonNullAssertion: filtered above
					branch: wt.branch!,
				}));
			}),
	});
};
