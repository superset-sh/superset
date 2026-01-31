import { projects, worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { track } from "main/lib/analytics";
import { localDb } from "main/lib/local-db";
import { workspaceInitManager } from "main/lib/workspace-init-manager";
import {
	branchExistsOnRemote,
	createWorktree,
	createWorktreeFromExistingBranch,
	fetchDefaultBranch,
	hasOriginRemote,
	refExistsLocally,
	refreshDefaultBranch,
	removeWorktree,
	sanitizeGitError,
} from "./git";
import { copySupersetConfigToWorktree } from "./setup";

export interface WorkspaceInitParams {
	workspaceId: string;
	projectId: string;
	worktreeId: string;
	worktreePath: string;
	branch: string;
	baseBranch: string;
	/** If true, user explicitly specified baseBranch - don't auto-update it */
	baseBranchWasExplicit: boolean;
	mainRepoPath: string;
	/** If true, use an existing branch instead of creating a new one */
	useExistingBranch?: boolean;
	/** If true, skip worktree creation (worktree already exists on disk) */
	skipWorktreeCreation?: boolean;
}

/**
 * Background initialization for workspace worktree.
 * This runs after the fast-path mutation returns, streaming progress to the renderer.
 *
 * Does NOT throw - errors are communicated via progress events.
 */
export async function initializeWorkspaceWorktree({
	workspaceId,
	projectId,
	worktreeId,
	worktreePath,
	branch,
	baseBranch,
	baseBranchWasExplicit,
	mainRepoPath,
	useExistingBranch,
	skipWorktreeCreation,
}: WorkspaceInitParams): Promise<void> {
	const manager = workspaceInitManager;

	try {
		// Acquire per-project lock to prevent concurrent git operations
		await manager.acquireProjectLock(projectId);

		// Check cancellation before starting (use durable cancellation check)
		// Note: We don't emit "failed" progress for cancellations because the workspace
		// is being deleted. Emitting would trigger a refetch race condition where the
		// workspace temporarily reappears. finalizeJob() in the finally block will
		// still unblock waitForInit() callers.
		if (manager.isCancellationRequested(workspaceId)) {
			return;
		}

		if (useExistingBranch) {
			if (skipWorktreeCreation) {
				manager.markWorktreeCreated(workspaceId);
			} else {
				manager.updateProgress(
					workspaceId,
					"creating_worktree",
					"Creating git worktree...",
				);
				await createWorktreeFromExistingBranch({
					mainRepoPath,
					branch,
					worktreePath,
				});
				manager.markWorktreeCreated(workspaceId);
			}

			if (manager.isCancellationRequested(workspaceId)) {
				try {
					await removeWorktree(mainRepoPath, worktreePath);
				} catch (e) {
					console.error(
						"[workspace-init] Failed to cleanup worktree after cancel:",
						e,
					);
				}
				return;
			}

			manager.updateProgress(
				workspaceId,
				"copying_config",
				"Copying configuration...",
			);
			copySupersetConfigToWorktree(mainRepoPath, worktreePath);

			if (manager.isCancellationRequested(workspaceId)) {
				try {
					await removeWorktree(mainRepoPath, worktreePath);
				} catch (e) {
					console.error(
						"[workspace-init] Failed to cleanup worktree after cancel:",
						e,
					);
				}
				return;
			}

			manager.updateProgress(workspaceId, "finalizing", "Finalizing setup...");
			localDb
				.update(worktrees)
				.set({
					gitStatus: {
						branch,
						needsRebase: false,
						lastRefreshed: Date.now(),
					},
				})
				.where(eq(worktrees.id, worktreeId))
				.run();

			manager.updateProgress(workspaceId, "ready", "Ready");

			track("workspace_initialized", {
				workspace_id: workspaceId,
				project_id: projectId,
				branch,
				base_branch: branch, // For existing branch, base = branch
				use_existing_branch: true,
			});

			return;
		}

		manager.updateProgress(workspaceId, "syncing", "Syncing with remote...");
		const remoteDefaultBranch = await refreshDefaultBranch(mainRepoPath);

		let effectiveBaseBranch = baseBranch;

		if (remoteDefaultBranch) {
			const project = localDb
				.select()
				.from(projects)
				.where(eq(projects.id, projectId))
				.get();
			if (project && remoteDefaultBranch !== project.defaultBranch) {
				localDb
					.update(projects)
					.set({ defaultBranch: remoteDefaultBranch })
					.where(eq(projects.id, projectId))
					.run();
			}

			// If baseBranch was auto-derived and differs from remote,
			// update the worktree record so retries use the correct branch
			if (!baseBranchWasExplicit && remoteDefaultBranch !== baseBranch) {
				console.log(
					`[workspace-init] Auto-updating baseBranch from "${baseBranch}" to "${remoteDefaultBranch}" for workspace ${workspaceId}`,
				);
				effectiveBaseBranch = remoteDefaultBranch;
				localDb
					.update(worktrees)
					.set({ baseBranch: remoteDefaultBranch })
					.where(eq(worktrees.id, worktreeId))
					.run();
			}
		}

		if (manager.isCancellationRequested(workspaceId)) {
			return;
		}

		manager.updateProgress(
			workspaceId,
			"verifying",
			"Verifying base branch...",
		);
		const hasRemote = await hasOriginRemote(mainRepoPath);

		const resolveLocalStartPoint = async (
			reason: string,
		): Promise<string | null> => {
			const originRef = `origin/${effectiveBaseBranch}`;
			if (await refExistsLocally(mainRepoPath, originRef)) {
				console.log(
					`[workspace-init] ${reason}. Using local tracking ref: ${originRef}`,
				);
				return originRef;
			}
			if (await refExistsLocally(mainRepoPath, effectiveBaseBranch)) {
				console.log(
					`[workspace-init] ${reason}. Using local branch: ${effectiveBaseBranch}`,
				);
				return effectiveBaseBranch;
			}
			return null;
		};

		let startPoint: string;
		if (hasRemote) {
			const branchCheck = await branchExistsOnRemote(
				mainRepoPath,
				effectiveBaseBranch,
			);

			if (branchCheck.status === "error") {
				const sanitizedError = sanitizeGitError(branchCheck.message);
				console.warn(
					`[workspace-init] Cannot verify remote branch: ${sanitizedError}. Falling back to local ref.`,
				);

				manager.updateProgress(
					workspaceId,
					"verifying",
					"Using local reference (remote unavailable)",
					sanitizedError,
				);

				const localRef = await resolveLocalStartPoint("Remote unavailable");
				if (!localRef) {
					manager.updateProgress(
						workspaceId,
						"failed",
						"No local reference available",
						`Cannot reach remote and no local ref for "${effectiveBaseBranch}" exists. Please check your network connection and try again.`,
					);
					return;
				}
				startPoint = localRef;
			} else if (branchCheck.status === "not_found") {
				manager.updateProgress(
					workspaceId,
					"failed",
					"Branch does not exist on remote",
					`Branch "${effectiveBaseBranch}" does not exist on origin. Please delete this workspace and try again with a different base branch.`,
				);
				return;
			} else {
				startPoint = `origin/${effectiveBaseBranch}`;
			}
		} else {
			const localRef = await resolveLocalStartPoint("No remote configured");
			if (!localRef) {
				manager.updateProgress(
					workspaceId,
					"failed",
					"No local reference available",
					`No remote configured and no local ref for "${effectiveBaseBranch}" exists.`,
				);
				return;
			}
			startPoint = localRef;
		}

		if (manager.isCancellationRequested(workspaceId)) {
			return;
		}

		manager.updateProgress(
			workspaceId,
			"fetching",
			"Fetching latest changes...",
		);
		if (hasRemote) {
			try {
				await fetchDefaultBranch(mainRepoPath, effectiveBaseBranch);
			} catch {
				// Silently continue - branch exists on remote, just couldn't fetch
			}
		}

		if (manager.isCancellationRequested(workspaceId)) {
			return;
		}

		manager.updateProgress(
			workspaceId,
			"creating_worktree",
			"Creating git worktree...",
		);
		await createWorktree(mainRepoPath, branch, worktreePath, startPoint);
		manager.markWorktreeCreated(workspaceId);

		if (manager.isCancellationRequested(workspaceId)) {
			try {
				await removeWorktree(mainRepoPath, worktreePath);
			} catch (e) {
				console.error(
					"[workspace-init] Failed to cleanup worktree after cancel:",
					e,
				);
			}
			return;
		}

		manager.updateProgress(
			workspaceId,
			"copying_config",
			"Copying configuration...",
		);
		copySupersetConfigToWorktree(mainRepoPath, worktreePath);

		if (manager.isCancellationRequested(workspaceId)) {
			try {
				await removeWorktree(mainRepoPath, worktreePath);
			} catch (e) {
				console.error(
					"[workspace-init] Failed to cleanup worktree after cancel:",
					e,
				);
			}
			return;
		}

		manager.updateProgress(workspaceId, "finalizing", "Finalizing setup...");

		localDb
			.update(worktrees)
			.set({
				gitStatus: {
					branch,
					needsRebase: false,
					lastRefreshed: Date.now(),
				},
			})
			.where(eq(worktrees.id, worktreeId))
			.run();

		manager.updateProgress(workspaceId, "ready", "Ready");

		track("workspace_initialized", {
			workspace_id: workspaceId,
			project_id: projectId,
			branch,
			base_branch: effectiveBaseBranch,
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(
			`[workspace-init] Failed to initialize ${workspaceId}:`,
			errorMessage,
		);

		if (manager.wasWorktreeCreated(workspaceId)) {
			try {
				await removeWorktree(mainRepoPath, worktreePath);
				console.log(
					`[workspace-init] Cleaned up partial worktree at ${worktreePath}`,
				);
			} catch (cleanupError) {
				console.error(
					"[workspace-init] Failed to cleanup partial worktree:",
					cleanupError,
				);
			}
		}

		manager.updateProgress(
			workspaceId,
			"failed",
			"Initialization failed",
			errorMessage,
		);
	} finally {
		// Always finalize the job to unblock waitForInit() callers (e.g., delete mutation)
		manager.finalizeJob(workspaceId);
		manager.releaseProjectLock(projectId);
	}
}
