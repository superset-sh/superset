import { observable } from "@trpc/server/observable";
import { workspaceInitManager } from "main/lib/workspace-init-manager";
import type { WorkspaceInitProgress } from "shared/types/workspace-init";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import { getProject, getWorkspaceWithRelations } from "../utils/db-helpers";
import { loadSetupConfig } from "../utils/setup";
import { initializeWorkspaceWorktree } from "../utils/workspace-init";

export const createInitProcedures = () => {
	return router({
		/**
		 * Subscribe to workspace initialization progress events.
		 * Streams progress updates for workspaces that are currently initializing.
		 */
		onInitProgress: publicProcedure
			.input(
				z.object({ workspaceIds: z.array(z.string()).optional() }).optional(),
			)
			.subscription(({ input }) => {
				return observable<WorkspaceInitProgress>((emit) => {
					const handler = (progress: WorkspaceInitProgress) => {
						// If specific workspaces requested, filter
						if (
							input?.workspaceIds &&
							!input.workspaceIds.includes(progress.workspaceId)
						) {
							return;
						}
						emit.next(progress);
					};

					// Send current state for initializing/failed workspaces
					for (const progress of workspaceInitManager.getAllProgress()) {
						if (
							!input?.workspaceIds ||
							input.workspaceIds.includes(progress.workspaceId)
						) {
							emit.next(progress);
						}
					}

					workspaceInitManager.on("progress", handler);

					return () => {
						workspaceInitManager.off("progress", handler);
					};
				});
			}),

		/**
		 * Retry initialization for a failed workspace.
		 * Clears the failed state and restarts the initialization process.
		 */
		retryInit: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.mutation(async ({ input }) => {
				const relations = getWorkspaceWithRelations(input.workspaceId);

				if (!relations) {
					throw new Error("Workspace not found");
				}

				const { workspace, worktree, project } = relations;

				if (workspace.deletingAt) {
					throw new Error(
						"Cannot retry initialization on a workspace being deleted",
					);
				}

				if (!worktree) {
					throw new Error("Worktree not found");
				}

				if (!project) {
					throw new Error("Project not found");
				}

				// Clear the failed state
				workspaceInitManager.clearJob(input.workspaceId);

				// Start fresh initialization
				workspaceInitManager.startJob(input.workspaceId, workspace.projectId);

				// Run initialization in background (DO NOT await)
				// On retry, the worktree.baseBranch is already correct (either originally explicit
				// or auto-corrected by P1 fix), so we treat it as explicit to prevent further updates
				initializeWorkspaceWorktree({
					workspaceId: input.workspaceId,
					projectId: workspace.projectId,
					worktreeId: worktree.id,
					worktreePath: worktree.path,
					branch: worktree.branch,
					baseBranch: worktree.baseBranch ?? project.defaultBranch ?? "main",
					baseBranchWasExplicit: true,
					mainRepoPath: project.mainRepoPath,
				});

				return { success: true };
			}),

		/**
		 * Get current initialization progress for a workspace.
		 * Returns null if the workspace is not initializing.
		 */
		getInitProgress: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(({ input }) => {
				return workspaceInitManager.getProgress(input.workspaceId) ?? null;
			}),

		/**
		 * Get setup commands for a workspace.
		 * Used as a fallback when pending terminal setup data is lost (e.g., after retry or app restart).
		 * Re-reads the project config to get fresh commands.
		 */
		getSetupCommands: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(({ input }) => {
				const relations = getWorkspaceWithRelations(input.workspaceId);

				if (!relations) {
					return null;
				}

				const project = getProject(relations.workspace.projectId);

				if (!project) {
					return null;
				}

				// Re-read config from project to get fresh commands
				const setupConfig = loadSetupConfig(project.mainRepoPath);

				return {
					projectId: project.id,
					initialCommands: setupConfig?.setup ?? null,
				};
			}),
	});
};
