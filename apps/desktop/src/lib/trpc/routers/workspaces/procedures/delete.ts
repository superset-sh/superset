import type { SelectWorktree } from "@superset/local-db";
import { track } from "main/lib/analytics";
import { getActiveTerminalManager } from "main/lib/terminal";
import { workspaceInitManager } from "main/lib/workspace-init-manager";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import {
	deleteWorkspace,
	deleteWorktreeRecord,
	getProject,
	getWorkspace,
	getWorktree,
	hideProjectIfNoWorkspaces,
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

				const activeTerminalCount =
					await getActiveTerminalManager().getSessionCountByWorkspaceId(
						input.id,
					);

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

				// If skipping git checks, return early with just terminal count
				// This is used during polling to avoid expensive git operations
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

						// Check for uncommitted changes and unpushed commits in parallel
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

				// Cancel any ongoing initialization and wait for it to complete
				// This ensures we don't race with init's git operations
				if (workspaceInitManager.isInitializing(input.id)) {
					console.log(
						`[workspace/delete] Cancelling init for ${input.id}, waiting for completion...`,
					);
					workspaceInitManager.cancel(input.id);
					// Wait for init to finish (up to 30s) - it will see cancellation and exit
					await workspaceInitManager.waitForInit(input.id, 30000);
				}

				// Kill all terminal processes in this workspace first
				const terminalResult =
					await getActiveTerminalManager().killByWorkspaceId(input.id);

				const project = getProject(workspace.projectId);

				let worktree: SelectWorktree | undefined;

				// Branch workspaces don't have worktrees - skip worktree operations
				if (workspace.type === "worktree" && workspace.worktreeId) {
					worktree = getWorktree(workspace.worktreeId);

					if (worktree && project) {
						// Acquire project lock before any git operations
						// This prevents racing with any concurrent init operations
						await workspaceInitManager.acquireProjectLock(project.id);

						try {
							// Run teardown scripts before removing worktree
							const exists = await worktreeExists(
								project.mainRepoPath,
								worktree.path,
							);

							if (exists) {
								const teardownResult = await runTeardown(
									project.mainRepoPath,
									worktree.path,
									workspace.name,
								);
								if (!teardownResult.success) {
									console.error(
										`Teardown failed for workspace ${workspace.name}:`,
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
					}
				}

				// Proceed with DB cleanup
				deleteWorkspace(input.id);

				if (worktree) {
					deleteWorktreeRecord(worktree.id);
				}

				if (project) {
					hideProjectIfNoWorkspaces(workspace.projectId);
				}

				updateActiveWorkspaceIfRemoved(input.id);

				const terminalWarning =
					terminalResult.failed > 0
						? `${terminalResult.failed} terminal process(es) may still be running`
						: undefined;

				track("workspace_deleted", { workspace_id: input.id });

				// Clear init job state only after all cleanup is complete
				// This ensures cancellation signals remain visible during cleanup
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

				const terminalResult =
					await getActiveTerminalManager().killByWorkspaceId(input.id);

				// Delete workspace record ONLY, keep worktree
				deleteWorkspace(input.id);

				// Check if project should be hidden (no more open workspaces)
				hideProjectIfNoWorkspaces(workspace.projectId);

				// Update active workspace if this was the active one
				updateActiveWorkspaceIfRemoved(input.id);

				const terminalWarning =
					terminalResult.failed > 0
						? `${terminalResult.failed} terminal process(es) may still be running`
						: undefined;

				track("workspace_closed", { workspace_id: input.id });

				return { success: true, terminalWarning };
			}),
	});
};
