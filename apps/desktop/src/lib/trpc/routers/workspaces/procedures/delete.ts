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
	hasUncommittedChanges,
	hasUnpushedCommits,
	removeWorktree,
	worktreeExists,
} from "../utils/git";
import { runTeardown } from "../utils/teardown";

export const createDeleteProcedures = () => {
	return router({
		canDelete: publicProcedure
			.input(
				z.object({
					id: z.string(),
					// Skip expensive git checks (status, unpushed) during polling - only check terminal count
					skipGitChecks: z.boolean().optional(),
				}),
			)
			.query(async ({ input }) => {
				const workspace = getWorkspace(input.id);

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

				const activeTerminalCount = await getWorkspaceRuntimeRegistry()
					.getForWorkspaceId(input.id)
					.terminal.getSessionCountByWorkspaceId(input.id);

				// Branch workspaces are non-destructive to close - no git checks needed
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

				// Polling uses skipGitChecks to avoid expensive git operations
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
					? getWorktree(workspace.worktreeId)
					: null;
				const project = getProject(workspace.projectId);

				if (worktree && project) {
					try {
						const exists = await worktreeExists(
							project.mainRepoPath,
							worktree.path,
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
							hasUncommittedChanges(worktree.path),
							hasUnpushedCommits(worktree.path),
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
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				const workspace = getWorkspace(input.id);

				if (!workspace) {
					return { success: false, error: "Workspace not found" };
				}

				console.log(
					`[workspace/delete] Starting deletion of "${workspace.name}" (${input.id})`,
				);

				markWorkspaceAsDeleting(input.id);
				updateActiveWorkspaceIfRemoved(input.id);

				// Wait for any ongoing init to complete to avoid racing git operations
				if (workspaceInitManager.isInitializing(input.id)) {
					console.log(
						`[workspace/delete] Cancelling init for ${input.id}, waiting for completion...`,
					);
					workspaceInitManager.cancel(input.id);
					try {
						await workspaceInitManager.waitForInit(input.id, 30000);
					} catch (error) {
						console.error(
							`[workspace/delete] Failed to wait for init cancellation:`,
							error,
						);
						clearWorkspaceDeletingStatus(input.id);
						return {
							success: false,
							error:
								"Failed to cancel workspace initialization. Please try again.",
						};
					}
				}

				const project = getProject(workspace.projectId);

				let worktree: SelectWorktree | undefined;

				// Fire terminal kills (don't await yet)
				const terminalPromise = getWorkspaceRuntimeRegistry()
					.getForWorkspaceId(input.id)
					.terminal.killByWorkspaceId(input.id);

				// Fire teardown in parallel with terminal kills
				let teardownPromise: Promise<void> | undefined;
				if (workspace.type === "worktree" && workspace.worktreeId) {
					worktree = getWorktree(workspace.worktreeId);

					if (worktree && project && existsSync(worktree.path)) {
						const wt = worktree;
						teardownPromise = runTeardown(
							project.mainRepoPath,
							wt.path,
							workspace.name,
						).then((result) => {
							if (!result.success) {
								console.error(
									`[workspace/delete] Teardown failed:`,
									result.error,
								);
							}
						});
					}
				}

				// Wait for both terminal kills and teardown to finish
				const [terminalResult] = await Promise.all([
					terminalPromise,
					teardownPromise ?? Promise.resolve(),
				]);

				// Only hold the project lock for the git worktree removal
				if (worktree && project) {
					await workspaceInitManager.acquireProjectLock(project.id);

					try {
						await removeWorktree(project.mainRepoPath, worktree.path);
					} catch (error) {
						const errorMessage =
							error instanceof Error ? error.message : String(error);
						// If worktree was already removed, that's fine
						if (
							!errorMessage.includes("is not a working tree") &&
							!errorMessage.includes("No such file or directory")
						) {
							console.error("Failed to remove worktree:", errorMessage);
							clearWorkspaceDeletingStatus(input.id);
							return {
								success: false,
								error: `Failed to remove worktree: ${errorMessage}`,
							};
						}
						console.warn(
							`Worktree ${worktree.path} not found in git, skipping removal`,
						);
					} finally {
						workspaceInitManager.releaseProjectLock(project.id);
					}
				}

				deleteWorkspace(input.id);

				if (worktree) {
					deleteWorktreeRecord(worktree.id);
				}

				if (project) {
					hideProjectIfNoWorkspaces(workspace.projectId);
				}

				const terminalWarning =
					terminalResult.failed > 0
						? `${terminalResult.failed} terminal process(es) may still be running`
						: undefined;

				track("workspace_deleted", { workspace_id: input.id });

				// Clear after cleanup so cancellation signals remain visible during deletion
				workspaceInitManager.clearJob(input.id);

				return { success: true, terminalWarning };
			}),

		close: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				const workspace = getWorkspace(input.id);

				if (!workspace) {
					throw new Error("Workspace not found");
				}

				const terminalResult = await getWorkspaceRuntimeRegistry()
					.getForWorkspaceId(input.id)
					.terminal.killByWorkspaceId(input.id);

				deleteWorkspace(input.id); // keeps worktree on disk
				hideProjectIfNoWorkspaces(workspace.projectId);
				updateActiveWorkspaceIfRemoved(input.id);

				const terminalWarning =
					terminalResult.failed > 0
						? `${terminalResult.failed} terminal process(es) may still be running`
						: undefined;

				track("workspace_closed", { workspace_id: input.id });

				return { success: true, terminalWarning };
			}),

		// Check if a closed worktree (no active workspace) can be deleted
		canDeleteWorktree: publicProcedure
			.input(
				z.object({
					worktreeId: z.string(),
					skipGitChecks: z.boolean().optional(),
				}),
			)
			.query(async ({ input }) => {
				const worktree = getWorktree(input.worktreeId);

				if (!worktree) {
					return {
						canDelete: false,
						reason: "Worktree not found",
						worktree: null,
						hasChanges: false,
						hasUnpushedCommits: false,
					};
				}

				const project = getProject(worktree.projectId);

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
					const exists = await worktreeExists(
						project.mainRepoPath,
						worktree.path,
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
						hasUncommittedChanges(worktree.path),
						hasUnpushedCommits(worktree.path),
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

		// Delete a closed worktree (no active workspace) by worktree ID
		deleteWorktree: publicProcedure
			.input(z.object({ worktreeId: z.string() }))
			.mutation(async ({ input }) => {
				const worktree = getWorktree(input.worktreeId);

				if (!worktree) {
					return { success: false, error: "Worktree not found" };
				}

				const project = getProject(worktree.projectId);

				if (!project) {
					return { success: false, error: "Project not found" };
				}

				// Acquire project lock to prevent racing with concurrent operations
				await workspaceInitManager.acquireProjectLock(project.id);

				try {
					const exists = await worktreeExists(
						project.mainRepoPath,
						worktree.path,
					);

					if (exists) {
						const teardownResult = await runTeardown(
							project.mainRepoPath,
							worktree.path,
							worktree.branch,
						);
						if (!teardownResult.success) {
							console.error(
								`Teardown failed for worktree ${worktree.branch}:`,
								teardownResult.error,
							);
						}
					}

					try {
						if (exists) {
							await removeWorktree(project.mainRepoPath, worktree.path);
						} else {
							console.warn(
								`Worktree ${worktree.path} not found in git, skipping removal`,
							);
						}
					} catch (error) {
						const errorMessage =
							error instanceof Error ? error.message : String(error);
						console.error("Failed to remove worktree:", errorMessage);
						return {
							success: false,
							error: `Failed to remove worktree: ${errorMessage}`,
						};
					}
				} finally {
					workspaceInitManager.releaseProjectLock(project.id);
				}

				deleteWorktreeRecord(input.worktreeId);
				hideProjectIfNoWorkspaces(worktree.projectId);

				track("worktree_deleted", { worktree_id: input.worktreeId });

				return { success: true };
			}),
	});
};
