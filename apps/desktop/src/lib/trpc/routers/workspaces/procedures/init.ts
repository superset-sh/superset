import { workspaces, worktrees } from "@superset/local-db";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { workspaceInitManager } from "main/lib/workspace-init-manager";
import type { WorkspaceInitProgress } from "shared/types/workspace-init";
import { deduplicateBranchName } from "shared/utils/branch";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import { getPresetsForTrigger } from "../../settings";
import { getProject, getWorkspaceWithRelations } from "../utils/db-helpers";
import { listBranches } from "../utils/git";
import { resolveWorktreePath } from "../utils/resolve-worktree-path";
import { loadSetupConfig } from "../utils/setup";
import { initializeWorkspaceWorktree } from "../utils/workspace-init";

type WorkspaceRelations = NonNullable<
	ReturnType<typeof getWorkspaceWithRelations>
>;

function getRetryInitRelations(workspaceId: string): {
	workspace: WorkspaceRelations["workspace"];
	worktree: NonNullable<WorkspaceRelations["worktree"]>;
	project: NonNullable<WorkspaceRelations["project"]>;
} {
	const relations = getWorkspaceWithRelations(workspaceId);
	if (!relations) {
		throw new Error("Workspace not found");
	}

	const { workspace, worktree, project } = relations;
	if (workspace.deletingAt) {
		throw new Error("Cannot retry initialization on a workspace being deleted");
	}
	if (!worktree) {
		throw new Error("Worktree not found");
	}
	if (!project) {
		throw new Error("Project not found");
	}

	return { workspace, worktree, project };
}

function persistRetryBranchUpdate({
	workspace,
	worktreeId,
	branch,
	path,
}: {
	workspace: WorkspaceRelations["workspace"];
	worktreeId: string;
	branch: string;
	path: string;
}): void {
	localDb
		.update(worktrees)
		.set({ branch, path })
		.where(eq(worktrees.id, worktreeId))
		.run();

	localDb
		.update(workspaces)
		.set({
			branch,
			...(workspace.isUnnamed ? { name: branch } : {}),
		})
		.where(eq(workspaces.id, workspace.id))
		.run();
}

async function resolveRetryTarget({
	workspace,
	worktree,
	project,
	deduplicateBranchName: shouldDeduplicateBranchName,
}: {
	workspace: WorkspaceRelations["workspace"];
	worktree: NonNullable<WorkspaceRelations["worktree"]>;
	project: NonNullable<WorkspaceRelations["project"]>;
	deduplicateBranchName: boolean;
}): Promise<{ branch: string; worktreePath: string }> {
	const currentBranch = worktree.branch;
	const currentPath = worktree.path;

	if (!shouldDeduplicateBranchName) {
		return { branch: currentBranch, worktreePath: currentPath };
	}

	const { local, remote } = await listBranches(project.mainRepoPath);
	const deduplicatedBranch = deduplicateBranchName(currentBranch, [
		...local,
		...remote,
	]);
	if (deduplicatedBranch === currentBranch) {
		return { branch: currentBranch, worktreePath: currentPath };
	}

	const deduplicatedPath = resolveWorktreePath(project, deduplicatedBranch);
	persistRetryBranchUpdate({
		workspace,
		worktreeId: worktree.id,
		branch: deduplicatedBranch,
		path: deduplicatedPath,
	});

	return { branch: deduplicatedBranch, worktreePath: deduplicatedPath };
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
			.input(
				z.object({
					workspaceId: z.string(),
					deduplicateBranchName: z.boolean().optional().default(false),
				}),
			)
			.mutation(async ({ input }) => {
				const { workspace, worktree, project } = getRetryInitRelations(
					input.workspaceId,
				);
				const { branch, worktreePath } = await resolveRetryTarget({
					workspace,
					worktree,
					project,
					deduplicateBranchName: input.deduplicateBranchName,
				});

				workspaceInitManager.clearJob(input.workspaceId);
				workspaceInitManager.startJob(input.workspaceId, workspace.projectId);

				initializeWorkspaceWorktree({
					workspaceId: input.workspaceId,
					projectId: workspace.projectId,
					worktreeId: worktree.id,
					worktreePath,
					branch,
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
					projectId: project.id,
				});
				const defaultPresets = getPresetsForTrigger("applyOnWorkspaceCreated");

				return {
					projectId: project.id,
					initialCommands: setupConfig?.setup ?? null,
					defaultPresets,
				};
			}),
	});
};
