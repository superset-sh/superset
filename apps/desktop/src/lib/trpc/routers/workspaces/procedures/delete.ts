import { existsSync } from "node:fs";
import type { SelectWorktree } from "@superset/local-db";
import { track } from "main/lib/analytics";
import { workspaceInitManager } from "main/lib/workspace-init-manager";
import { getWorkspaceRuntimeRegistry } from "main/lib/workspace-runtime";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import {
	clearWorkspaceDeletingStatus,
	deleteWorkspace,
	deleteWorktreeRecord,
	getProject,
	getWorkspace,
	getWorktree,
	hideProjectIfNoWorkspaces,
	markWorkspaceAsDeleting,
	updateActiveWorkspaceIfRemoved,
} from "../utils/db-helpers";
import {
	deleteLocalBranch,
	hasUncommittedChanges,
	hasUnpushedCommits,
	worktreeExists,
} from "../utils/git";
import {
	getTrackedWorktreeRepairMessage,
	type ResolveTrackedWorktreePathResult,
	resolveTrackedWorktreePath,
} from "../utils/repair-worktree-path";
import { removeWorktreeFromDisk, runTeardown } from "../utils/teardown";

interface CleanupTrackedWorktreePath {
	path: string;
	usesFallbackPath: boolean;
	warning: string | null;
}

interface DeleteProcedureDeps {
	clearWorkspaceDeletingStatus: typeof clearWorkspaceDeletingStatus;
	deleteLocalBranch: typeof deleteLocalBranch;
	deleteWorkspace: typeof deleteWorkspace;
	deleteWorktreeRecord: typeof deleteWorktreeRecord;
	getProject: typeof getProject;
	getWorkspace: typeof getWorkspace;
	getWorkspaceRuntimeRegistry: typeof getWorkspaceRuntimeRegistry;
	getWorktree: typeof getWorktree;
	hasUncommittedChanges: typeof hasUncommittedChanges;
	hasUnpushedCommits: typeof hasUnpushedCommits;
	hideProjectIfNoWorkspaces: typeof hideProjectIfNoWorkspaces;
	markWorkspaceAsDeleting: typeof markWorkspaceAsDeleting;
	removeWorktreeFromDisk: typeof removeWorktreeFromDisk;
	resolveTrackedWorktreePath: typeof resolveTrackedWorktreePath;
	runTeardown: typeof runTeardown;
	track: typeof track;
	updateActiveWorkspaceIfRemoved: typeof updateActiveWorkspaceIfRemoved;
	workspaceInitManager: typeof workspaceInitManager;
	worktreeExists: typeof worktreeExists;
}

export const __testOnlyDeleteProcedureDeps: DeleteProcedureDeps = {
	clearWorkspaceDeletingStatus,
	deleteLocalBranch,
	deleteWorkspace,
	deleteWorktreeRecord,
	getProject,
	getWorkspace,
	getWorkspaceRuntimeRegistry,
	getWorktree,
	hasUncommittedChanges,
	hasUnpushedCommits,
	hideProjectIfNoWorkspaces,
	markWorkspaceAsDeleting,
	removeWorktreeFromDisk,
	resolveTrackedWorktreePath,
	runTeardown,
	track,
	updateActiveWorkspaceIfRemoved,
	workspaceInitManager,
	worktreeExists,
};

function getCleanupFallbackWarning(
	resolution: Exclude<ResolveTrackedWorktreePathResult, { status: "resolved" }>,
): string {
	if (resolution.status === "git_repair_required") {
		return `Worktree was moved and could not be auto-repaired. Delete will fall back to the stored path. ${getTrackedWorktreeRepairMessage(
			{
				branch: resolution.branch,
				mainRepoPath: resolution.mainRepoPath,
			},
		)}`;
	}

	return "Tracked worktree path no longer exists on disk. Delete will remove the Superset record and skip any on-disk teardown.";
}

async function resolveTrackedWorktreePathForCleanup(
	worktree: SelectWorktree,
): Promise<CleanupTrackedWorktreePath> {
	const resolution =
		await __testOnlyDeleteProcedureDeps.resolveTrackedWorktreePath(worktree.id);

	if (resolution.status === "resolved") {
		return {
			path: resolution.path,
			usesFallbackPath: false,
			warning: null,
		};
	}

	return {
		path: worktree.path,
		usesFallbackPath: true,
		warning: getCleanupFallbackWarning(resolution),
	};
}

export const createDeleteProcedures = () => {
	return router({
		canDelete: publicProcedure
			.input(
				z.object({
					id: z.string(),
					skipGitChecks: z.boolean().optional(),
				}),
			)
			.query(async ({ input }) => {
				const workspace = __testOnlyDeleteProcedureDeps.getWorkspace(input.id);

				if (!workspace) {
					return {
						canDelete: false,
						reason: "Workspace not found",
						workspace: null,
						activeTerminalCount: 0,
						hasChanges: false,
						hasUnpushedCommits: false,
					};
				}

				if (workspace.deletingAt) {
					return {
						canDelete: false,
						reason: "Deletion already in progress",
						workspace: null,
						activeTerminalCount: 0,
						hasChanges: false,
						hasUnpushedCommits: false,
					};
				}

				const activeTerminalCount = await __testOnlyDeleteProcedureDeps
					.getWorkspaceRuntimeRegistry()
					.getForWorkspaceId(input.id)
					.terminal.getSessionCountByWorkspaceId(input.id);

				if (workspace.type === "branch") {
					return {
						canDelete: true,
						reason: null,
						workspace,
						warning: null,
						activeTerminalCount,
						hasChanges: false,
						hasUnpushedCommits: false,
					};
				}

				if (input.skipGitChecks) {
					return {
						canDelete: true,
						reason: null,
						workspace,
						warning: null,
						activeTerminalCount,
						hasChanges: false,
						hasUnpushedCommits: false,
					};
				}

				const worktree = workspace.worktreeId
					? __testOnlyDeleteProcedureDeps.getWorktree(workspace.worktreeId)
					: null;
				const project = __testOnlyDeleteProcedureDeps.getProject(
					workspace.projectId,
				);

				if (worktree && project) {
					try {
						const pathResolution =
							await resolveTrackedWorktreePathForCleanup(worktree);
						if (pathResolution.usesFallbackPath) {
							return {
								canDelete: true,
								reason: null,
								workspace,
								warning: pathResolution.warning,
								activeTerminalCount,
								hasChanges: false,
								hasUnpushedCommits: false,
							};
						}

						const worktreePath = pathResolution.path;
						const exists = await __testOnlyDeleteProcedureDeps.worktreeExists(
							project.mainRepoPath,
							worktreePath,
						);

						if (!exists) {
							return {
								canDelete: true,
								reason: null,
								workspace,
								warning:
									"Worktree not found in git (may have been manually removed)",
								activeTerminalCount,
								hasChanges: false,
								hasUnpushedCommits: false,
							};
						}

						const [hasChanges, unpushedCommits] = await Promise.all([
							__testOnlyDeleteProcedureDeps.hasUncommittedChanges(worktreePath),
							__testOnlyDeleteProcedureDeps.hasUnpushedCommits(worktreePath),
						]);

						return {
							canDelete: true,
							reason: null,
							workspace,
							warning: null,
							activeTerminalCount,
							hasChanges,
							hasUnpushedCommits: unpushedCommits,
						};
					} catch (error) {
						return {
							canDelete: false,
							reason: `Failed to check worktree status: ${error instanceof Error ? error.message : String(error)}`,
							workspace,
							activeTerminalCount,
							hasChanges: false,
							hasUnpushedCommits: false,
						};
					}
				}

				return {
					canDelete: true,
					reason: null,
					workspace,
					warning: "No associated worktree found",
					activeTerminalCount,
					hasChanges: false,
					hasUnpushedCommits: false,
				};
			}),

		delete: publicProcedure
			.input(
				z.object({
					id: z.string(),
					deleteLocalBranch: z.boolean().optional(),
					force: z.boolean().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const workspace = __testOnlyDeleteProcedureDeps.getWorkspace(input.id);

				if (!workspace) {
					return { success: false, error: "Workspace not found" };
				}

				console.log(
					`[workspace/delete] Starting deletion of "${workspace.name}" (${input.id})`,
				);

				__testOnlyDeleteProcedureDeps.markWorkspaceAsDeleting(input.id);
				try {
					__testOnlyDeleteProcedureDeps.updateActiveWorkspaceIfRemoved(
						input.id,
					);

					if (
						__testOnlyDeleteProcedureDeps.workspaceInitManager.isInitializing(
							input.id,
						)
					) {
						console.log(
							`[workspace/delete] Cancelling init for ${input.id}, waiting for completion...`,
						);
						__testOnlyDeleteProcedureDeps.workspaceInitManager.cancel(input.id);
						try {
							await __testOnlyDeleteProcedureDeps.workspaceInitManager.waitForInit(
								input.id,
								30000,
							);
						} catch (error) {
							console.error(
								`[workspace/delete] Failed to wait for init cancellation:`,
								error,
							);
							__testOnlyDeleteProcedureDeps.clearWorkspaceDeletingStatus(
								input.id,
							);
							return {
								success: false,
								error:
									"Failed to cancel workspace initialization. Please try again.",
							};
						}
					}

					const project = __testOnlyDeleteProcedureDeps.getProject(
						workspace.projectId,
					);

					let worktree: SelectWorktree | undefined;
					let worktreePath: string | undefined;

					const terminalPromise = __testOnlyDeleteProcedureDeps
						.getWorkspaceRuntimeRegistry()
						.getForWorkspaceId(input.id)
						.terminal.killByWorkspaceId(input.id);

					let teardownPromise:
						| Promise<{ success: boolean; error?: string; output?: string }>
						| undefined;
					if (workspace.type === "worktree" && workspace.worktreeId) {
						worktree = __testOnlyDeleteProcedureDeps.getWorktree(
							workspace.worktreeId,
						);
						const pathResolution = worktree
							? await resolveTrackedWorktreePathForCleanup(worktree)
							: null;
						worktreePath = pathResolution?.path;

						if (pathResolution?.warning) {
							console.warn(`[workspace/delete] ${pathResolution.warning}`);
						}

						if (worktreePath && project && existsSync(worktreePath)) {
							teardownPromise = __testOnlyDeleteProcedureDeps.runTeardown({
								mainRepoPath: project.mainRepoPath,
								worktreePath,
								workspaceName: workspace.name,
								projectId: project.id,
							});
						} else {
							console.warn(
								`[workspace/delete] Skipping teardown: worktree=${!!worktree}, project=${!!project}, pathExists=${worktreePath ? existsSync(worktreePath) : "N/A"}`,
							);
						}
					} else {
						console.log(
							`[workspace/delete] No teardown needed: type=${workspace.type}, worktreeId=${workspace.worktreeId ?? "null"}`,
						);
					}

					const [terminalResult, teardownResult] = await Promise.all([
						terminalPromise,
						teardownPromise ?? Promise.resolve({ success: true as const }),
					]);

					if (teardownResult && !teardownResult.success) {
						if (input.force) {
							console.warn(
								`[workspace/delete] Teardown failed but force=true, continuing deletion:`,
								teardownResult.error,
							);
						} else {
							console.error(
								`[workspace/delete] Teardown failed:`,
								teardownResult.error,
							);
							__testOnlyDeleteProcedureDeps.clearWorkspaceDeletingStatus(
								input.id,
							);
							return {
								success: false,
								error: `Teardown failed: ${teardownResult.error}`,
								output: teardownResult.output,
							};
						}
					}

					if (worktree && project) {
						await __testOnlyDeleteProcedureDeps.workspaceInitManager.acquireProjectLock(
							project.id,
						);

						try {
							const removeResult =
								await __testOnlyDeleteProcedureDeps.removeWorktreeFromDisk({
									mainRepoPath: project.mainRepoPath,
									worktreePath: worktreePath ?? worktree.path,
								});
							if (!removeResult.success) {
								__testOnlyDeleteProcedureDeps.clearWorkspaceDeletingStatus(
									input.id,
								);
								return removeResult;
							}
						} finally {
							__testOnlyDeleteProcedureDeps.workspaceInitManager.releaseProjectLock(
								project.id,
							);
						}

						if (input.deleteLocalBranch && workspace.branch) {
							try {
								await __testOnlyDeleteProcedureDeps.deleteLocalBranch({
									mainRepoPath: project.mainRepoPath,
									branch: workspace.branch,
								});
							} catch (error) {
								console.error(
									`[workspace/delete] Branch cleanup failed (non-blocking):`,
									error instanceof Error ? error.message : String(error),
								);
							}
						}
					}

					__testOnlyDeleteProcedureDeps.deleteWorkspace(input.id);

					if (worktree) {
						__testOnlyDeleteProcedureDeps.deleteWorktreeRecord(worktree.id);
					}

					if (project) {
						__testOnlyDeleteProcedureDeps.hideProjectIfNoWorkspaces(
							workspace.projectId,
						);
					}

					const terminalWarning =
						terminalResult.failed > 0
							? `${terminalResult.failed} terminal process(es) may still be running`
							: undefined;

					__testOnlyDeleteProcedureDeps.track("workspace_deleted", {
						workspace_id: input.id,
					});

					__testOnlyDeleteProcedureDeps.workspaceInitManager.clearJob(input.id);

					return { success: true, terminalWarning };
				} catch (error) {
					__testOnlyDeleteProcedureDeps.clearWorkspaceDeletingStatus(input.id);
					throw error;
				}
			}),

		close: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				const workspace = __testOnlyDeleteProcedureDeps.getWorkspace(input.id);

				if (!workspace) {
					throw new Error("Workspace not found");
				}

				const terminalResult = await __testOnlyDeleteProcedureDeps
					.getWorkspaceRuntimeRegistry()
					.getForWorkspaceId(input.id)
					.terminal.killByWorkspaceId(input.id);

				__testOnlyDeleteProcedureDeps.deleteWorkspace(input.id);
				__testOnlyDeleteProcedureDeps.hideProjectIfNoWorkspaces(
					workspace.projectId,
				);
				__testOnlyDeleteProcedureDeps.updateActiveWorkspaceIfRemoved(input.id);

				const terminalWarning =
					terminalResult.failed > 0
						? `${terminalResult.failed} terminal process(es) may still be running`
						: undefined;

				__testOnlyDeleteProcedureDeps.track("workspace_closed", {
					workspace_id: input.id,
				});

				return { success: true, terminalWarning };
			}),

		canDeleteWorktree: publicProcedure
			.input(
				z.object({
					worktreeId: z.string(),
					skipGitChecks: z.boolean().optional(),
				}),
			)
			.query(async ({ input }) => {
				const worktree = __testOnlyDeleteProcedureDeps.getWorktree(
					input.worktreeId,
				);

				if (!worktree) {
					return {
						canDelete: false,
						reason: "Worktree not found",
						worktree: null,
						hasChanges: false,
						hasUnpushedCommits: false,
					};
				}

				const project = __testOnlyDeleteProcedureDeps.getProject(
					worktree.projectId,
				);

				if (!project) {
					return {
						canDelete: false,
						reason: "Project not found",
						worktree,
						hasChanges: false,
						hasUnpushedCommits: false,
					};
				}

				if (input.skipGitChecks) {
					return {
						canDelete: true,
						reason: null,
						worktree,
						warning: null,
						hasChanges: false,
						hasUnpushedCommits: false,
					};
				}

				try {
					const pathResolution =
						await resolveTrackedWorktreePathForCleanup(worktree);
					if (pathResolution.usesFallbackPath) {
						return {
							canDelete: true,
							reason: null,
							worktree,
							warning: pathResolution.warning,
							hasChanges: false,
							hasUnpushedCommits: false,
						};
					}

					const worktreePath = pathResolution.path;
					const exists = await __testOnlyDeleteProcedureDeps.worktreeExists(
						project.mainRepoPath,
						worktreePath,
					);

					if (!exists) {
						return {
							canDelete: true,
							reason: null,
							worktree,
							warning:
								"Worktree not found in git (may have been manually removed)",
							hasChanges: false,
							hasUnpushedCommits: false,
						};
					}

					const [hasChanges, unpushedCommits] = await Promise.all([
						__testOnlyDeleteProcedureDeps.hasUncommittedChanges(worktreePath),
						__testOnlyDeleteProcedureDeps.hasUnpushedCommits(worktreePath),
					]);

					return {
						canDelete: true,
						reason: null,
						worktree,
						warning: null,
						hasChanges,
						hasUnpushedCommits: unpushedCommits,
					};
				} catch (error) {
					return {
						canDelete: false,
						reason: `Failed to check worktree status: ${error instanceof Error ? error.message : String(error)}`,
						worktree,
						hasChanges: false,
						hasUnpushedCommits: false,
					};
				}
			}),

		deleteWorktree: publicProcedure
			.input(
				z.object({
					worktreeId: z.string(),
					force: z.boolean().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const worktree = __testOnlyDeleteProcedureDeps.getWorktree(
					input.worktreeId,
				);

				if (!worktree) {
					return { success: false, error: "Worktree not found" };
				}

				const project = __testOnlyDeleteProcedureDeps.getProject(
					worktree.projectId,
				);

				if (!project) {
					return { success: false, error: "Project not found" };
				}

				await __testOnlyDeleteProcedureDeps.workspaceInitManager.acquireProjectLock(
					project.id,
				);

				try {
					const pathResolution =
						await resolveTrackedWorktreePathForCleanup(worktree);
					const worktreePath = pathResolution.path;

					if (pathResolution.warning) {
						console.warn(`[worktree/delete] ${pathResolution.warning}`);
					}

					if (existsSync(worktreePath)) {
						const teardownResult =
							await __testOnlyDeleteProcedureDeps.runTeardown({
								mainRepoPath: project.mainRepoPath,
								worktreePath,
								workspaceName: worktree.branch,
								projectId: project.id,
							});
						if (!teardownResult.success) {
							if (input.force) {
								console.warn(
									`[worktree/delete] Teardown failed but force=true, continuing deletion:`,
									teardownResult.error,
								);
							} else {
								return {
									success: false,
									error: `Teardown failed: ${teardownResult.error}`,
									output: teardownResult.output,
								};
							}
						}
					}

					const removeResult =
						await __testOnlyDeleteProcedureDeps.removeWorktreeFromDisk({
							mainRepoPath: project.mainRepoPath,
							worktreePath,
						});
					if (!removeResult.success) {
						return removeResult;
					}
				} finally {
					__testOnlyDeleteProcedureDeps.workspaceInitManager.releaseProjectLock(
						project.id,
					);
				}

				__testOnlyDeleteProcedureDeps.deleteWorktreeRecord(input.worktreeId);
				__testOnlyDeleteProcedureDeps.hideProjectIfNoWorkspaces(
					worktree.projectId,
				);

				__testOnlyDeleteProcedureDeps.track("worktree_deleted", {
					worktree_id: input.worktreeId,
				});

				return { success: true };
			}),
	});
};
