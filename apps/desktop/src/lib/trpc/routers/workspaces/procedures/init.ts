import { settings } from "@superset/local-db";
import { observable } from "@trpc/server/observable";
import { localDb } from "main/lib/local-db";
import { workspaceInitManager } from "main/lib/workspace-init-manager";
import type { WorkspaceInitProgress } from "shared/types/workspace-init";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import { getProject, getWorkspaceWithRelations } from "../utils/db-helpers";
import { loadSetupConfig } from "../utils/setup";
import { initializeWorkspaceWorktree } from "../utils/workspace-init";

function getDefaultPreset() {
	const row = localDb.select().from(settings).get();
	if (!row) return null;
	const presets = row.terminalPresets ?? [];
	return presets.find((p) => p.isDefault) ?? null;
}

export const createInitProcedures = () => {
	return router({
		onInitProgress: publicProcedure
			.input(
				z.object({ workspaceIds: z.array(z.string()).optional() }).optional(),
			)
			.subscription(({ input }) => {
				return observable<WorkspaceInitProgress>((emit) => {
					const handler = (progress: WorkspaceInitProgress) => {
						if (
							input?.workspaceIds &&
							!input.workspaceIds.includes(progress.workspaceId)
						) {
							return;
						}
						emit.next(progress);
					};

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

				workspaceInitManager.clearJob(input.workspaceId);
				workspaceInitManager.startJob(input.workspaceId, workspace.projectId);

				// baseBranch is treated as explicit on retry to prevent further auto-correction
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

		getInitProgress: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(({ input }) => {
				return workspaceInitManager.getProgress(input.workspaceId) ?? null;
			}),

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

				const setupConfig = loadSetupConfig({
					mainRepoPath: project.mainRepoPath,
					worktreePath: relations.worktree?.path,
				});
				const defaultPreset = getDefaultPreset();

				return {
					projectId: project.id,
					initialCommands: setupConfig?.setup ?? null,
					defaultPreset,
				};
			}),
	});
};
