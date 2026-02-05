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
	checkNeedsRebase,
	fetchDefaultBranch,
	getDefaultBranch,
	listExternalWorktrees,
	refreshDefaultBranch,
} from "../utils/git";
import { fetchGitHubPRStatus } from "../utils/github";

export const createGitStatusProcedures = () => {
	return router({
		refreshGitStatus: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.mutation(async ({ input }) => {
				const workspace = getWorkspace(input.workspaceId);
				if (!workspace) {
					throw new Error(`Workspace ${input.workspaceId} not found`);
				}

				const worktree = workspace.worktreeId
					? getWorktree(workspace.worktreeId)
					: null;
				if (!worktree) {
					throw new Error(
						`Worktree for workspace ${input.workspaceId} not found`,
					);
				}

				const project = getProject(workspace.projectId);
				if (!project) {
					throw new Error(`Project ${workspace.projectId} not found`);
				}

				// Sync with remote in case the default branch changed (e.g. master -> main)
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

				// Fetch default branch to get latest
				await fetchDefaultBranch(project.mainRepoPath, defaultBranch);

				// Check if worktree branch is behind origin/{defaultBranch}
				const needsRebase = await checkNeedsRebase(
					worktree.path,
					defaultBranch,
				);

				const gitStatus = {
					branch: worktree.branch,
					needsRebase,
					lastRefreshed: Date.now(),
				};

				// Update worktree in db
				localDb
					.update(worktrees)
					.set({ gitStatus })
					.where(eq(worktrees.id, worktree.id))
					.run();

				return { gitStatus, defaultBranch };
			}),

		getGitHubStatus: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(async ({ input }) => {
				const workspace = getWorkspace(input.workspaceId);
				if (!workspace) {
					return null;
				}

				const worktree = workspace.worktreeId
					? getWorktree(workspace.worktreeId)
					: null;
				if (!worktree) {
					return null;
				}

				// Always fetch fresh data on hover
				const freshStatus = await fetchGitHubPRStatus(worktree.path);

				// Update cache if we got data
				if (freshStatus) {
					localDb
						.update(worktrees)
						.set({ githubStatus: freshStatus })
						.where(eq(worktrees.id, worktree.id))
						.run();
				}

				return freshStatus;
			}),

		getWorktreeInfo: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(({ input }) => {
				const workspace = getWorkspace(input.workspaceId);
				if (!workspace) {
					return null;
				}

				const worktree = workspace.worktreeId
					? getWorktree(workspace.worktreeId)
					: null;
				if (!worktree) {
					return null;
				}

				// Extract worktree name from path (last segment)
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

				return allWorktrees
					.filter((wt) => {
						if (wt.path === project.mainRepoPath) return false;
						if (wt.isBare) return false;
						if (wt.isDetached) return false;
						if (!wt.branch) return false;
						if (trackedPaths.has(wt.path)) return false;
						return true;
					})
					.map((wt) => ({
						path: wt.path,
						// biome-ignore lint/style/noNonNullAssertion: filtered above
						branch: wt.branch!,
					}));
			}),
	});
};
