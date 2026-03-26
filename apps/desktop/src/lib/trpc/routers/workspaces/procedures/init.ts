import { workspaces, worktrees } from "@superset/local-db";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import {
	type DraftWorkspaceProvisioningJob,
	workspaceInitManager,
} from "main/lib/workspace-init-manager";
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

type RetryInitTarget =
	| {
			kind: "persisted";
			workspace: WorkspaceRelations["workspace"];
			worktree: NonNullable<WorkspaceRelations["worktree"]>;
			project: NonNullable<WorkspaceRelations["project"]>;
	  }
	| {
			kind: "draft";
			draftJob: DraftWorkspaceProvisioningJob;
			project: NonNullable<ReturnType<typeof getProject>>;
	  };

function getRetryInitTarget(workspaceId: string): RetryInitTarget {
	const relations = getWorkspaceWithRelations(workspaceId);
	if (relations) {
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

		return { kind: "persisted", workspace, worktree, project };
	}

	const draftJob = workspaceInitManager.getDraftJob(workspaceId);
	if (!draftJob) {
		throw new Error("Workspace not found");
	}

	const project = getProject(draftJob.projectId);
	if (!project) {
		throw new Error("Project not found");
	}

	return { kind: "draft", draftJob, project };
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
	currentBranch,
	currentPath,
	project,
	deduplicateBranchName: shouldDeduplicateBranchName,
	applyUpdate,
}: {
	currentBranch: string;
	currentPath: string;
	project: NonNullable<ReturnType<typeof getProject>>;
	deduplicateBranchName: boolean;
	applyUpdate: (next: { branch: string; worktreePath: string }) => void;
}): Promise<{ branch: string; worktreePath: string }> {
	const branch = currentBranch;
	const path = currentPath;

	if (!shouldDeduplicateBranchName) {
		return { branch, worktreePath: path };
	}

	const { local, remote } = await listBranches(project.mainRepoPath);
	const deduplicatedBranch = deduplicateBranchName(branch, [
		...local,
		...remote,
	]);
	if (deduplicatedBranch === branch) {
		return { branch, worktreePath: path };
	}

	const deduplicatedPath = resolveWorktreePath(project, deduplicatedBranch);
	applyUpdate({
		branch: deduplicatedBranch,
		worktreePath: deduplicatedPath,
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
				const target = getRetryInitTarget(input.workspaceId);

				if (target.kind === "persisted") {
					const { workspace, worktree, project } = target;
					const { branch, worktreePath } = await resolveRetryTarget({
						currentBranch: worktree.branch,
						currentPath: worktree.path,
						project,
						deduplicateBranchName: input.deduplicateBranchName,
						applyUpdate: (next) => {
							persistRetryBranchUpdate({
								workspace,
								worktreeId: worktree.id,
								branch: next.branch,
								path: next.worktreePath,
							});
						},
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
				} else {
					const { draftJob, project } = target;
					const { branch, worktreePath } = await resolveRetryTarget({
						currentBranch: draftJob.branch,
						currentPath: draftJob.worktreePath,
						project,
						deduplicateBranchName: input.deduplicateBranchName,
						applyUpdate: (next) => {
							workspaceInitManager.updateDraftJob(input.workspaceId, {
								branch: next.branch,
								worktreePath: next.worktreePath,
								workspaceName: draftJob.isUnnamed
									? next.branch
									: draftJob.workspaceName,
							});
						},
					});
					const nextDraftJob = {
						...(workspaceInitManager.getDraftJob(input.workspaceId) ??
							draftJob),
						branch,
						worktreePath,
						workspaceName: draftJob.isUnnamed ? branch : draftJob.workspaceName,
					};

					workspaceInitManager.clearJob(input.workspaceId);
					workspaceInitManager.startJob(
						input.workspaceId,
						nextDraftJob.projectId,
						nextDraftJob,
					);

					initializeWorkspaceWorktree({
						workspaceId: input.workspaceId,
						projectId: nextDraftJob.projectId,
						worktreeId: nextDraftJob.worktreeId,
						worktreePath,
						branch,
						mainRepoPath: project.mainRepoPath,
						startPointBranch: nextDraftJob.startPointBranch,
						namingPrompt: nextDraftJob.namingPrompt,
						useExistingBranch: nextDraftJob.useExistingBranch,
						draftJob: nextDraftJob,
					});
				}

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
				const defaultPresets = getPresetsForTrigger(
					"applyOnWorkspaceCreated",
					project.id,
				);

				return {
					projectId: project.id,
					initialCommands: setupConfig?.setup ?? null,
					defaultPresets,
				};
			}),
	});
};
