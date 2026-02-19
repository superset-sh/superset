import { projects, worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { track } from "main/lib/analytics";
import { localDb } from "main/lib/local-db";
import { workspaceInitManager } from "main/lib/workspace-init-manager";
import type { WorkspaceInitStep } from "shared/types/workspace-init";
import { resolveWorkspaceBaseBranch } from "./base-branch";
import { getBranchBaseConfig, setBranchBaseConfig } from "./base-branch-config";
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
	mainRepoPath,
	useExistingBranch,
	skipWorktreeCreation,
}: WorkspaceInitParams): Promise<void> {
	const manager = workspaceInitManager;

	try {
		await manager.acquireProjectLock(projectId);

		// Don't emit "failed" for cancellations — the workspace is being deleted,
		// and emitting would trigger a refetch race condition where it temporarily
		// reappears. finalizeJob() in the finally block still unblocks waitForInit().
		if (manager.isCancellationRequested(workspaceId)) {
			return;
		}

		const project = localDb
			.select()
			.from(projects)
			.where(eq(projects.id, projectId))
			.get();

		const { baseBranch: gitConfigBase, isExplicit: baseBranchWasExplicit } =
			await getBranchBaseConfig({
				repoPath: mainRepoPath,
				branch,
			});
		let effectiveBaseBranch =
			gitConfigBase ||
			resolveWorkspaceBaseBranch({
				workspaceBaseBranch: project?.workspaceBaseBranch,
				defaultBranch: project?.defaultBranch,
			});

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
						ahead: 0,
						behind: 0,
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
				base_branch: branch,
				use_existing_branch: true,
			});

			return;
		}

		manager.updateProgress(workspaceId, "syncing", "Syncing with remote...");
		const remoteDefaultBranch = await refreshDefaultBranch(mainRepoPath);

		if (remoteDefaultBranch) {
			if (project && remoteDefaultBranch !== project.defaultBranch) {
				localDb
					.update(projects)
					.set({ defaultBranch: remoteDefaultBranch })
					.where(eq(projects.id, projectId))
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

		type LocalStartPointResult = {
			ref: string;
			fallbackBranch?: string;
		} | null;

		const resolveLocalStartPoint = async (
			reason: string,
			checkOriginRefs: boolean,
		): Promise<LocalStartPointResult> => {
			if (checkOriginRefs) {
				const originRef = `origin/${effectiveBaseBranch}`;
				if (await refExistsLocally(mainRepoPath, originRef)) {
					console.log(
						`[workspace-init] ${reason}. Using local tracking ref: ${originRef}`,
					);
					return { ref: originRef };
				}
			}

			if (await refExistsLocally(mainRepoPath, effectiveBaseBranch)) {
				console.log(
					`[workspace-init] ${reason}. Using local branch: ${effectiveBaseBranch}`,
				);
				return { ref: effectiveBaseBranch };
			}

			if (baseBranchWasExplicit) {
				console.log(
					`[workspace-init] ${reason}. Base branch "${effectiveBaseBranch}" was explicitly set, not using fallback.`,
				);
				return null;
			}

			const commonBranches = ["main", "master", "develop", "trunk"];
			for (const branch of commonBranches) {
				if (branch === effectiveBaseBranch) continue;
				if (checkOriginRefs) {
					const fallbackOriginRef = `origin/${branch}`;
					if (await refExistsLocally(mainRepoPath, fallbackOriginRef)) {
						console.log(
							`[workspace-init] ${reason}. Using fallback tracking ref: ${fallbackOriginRef}`,
						);
						return { ref: fallbackOriginRef, fallbackBranch: branch };
					}
				}
				if (await refExistsLocally(mainRepoPath, branch)) {
					console.log(
						`[workspace-init] ${reason}. Using fallback local branch: ${branch}`,
					);
					return { ref: branch, fallbackBranch: branch };
				}
			}

			return null;
		};

		const resolveLocalRef = async ({
			reason,
			checkOriginRefs,
			progressStep,
		}: {
			reason: string;
			checkOriginRefs: boolean;
			progressStep: WorkspaceInitStep;
		}): Promise<string | null> => {
			const result = await resolveLocalStartPoint(reason, checkOriginRefs);
			if (!result) return null;

			if (result.fallbackBranch) {
				const originalBranch = effectiveBaseBranch;
				console.log(
					`[workspace-init] Updating baseBranch from "${originalBranch}" to "${result.fallbackBranch}" for workspace ${workspaceId}`,
				);
				effectiveBaseBranch = result.fallbackBranch;
				await setBranchBaseConfig({
					repoPath: mainRepoPath,
					branch,
					baseBranch: result.fallbackBranch,
					isExplicit: false,
				});
				localDb
					.update(worktrees)
					.set({ baseBranch: result.fallbackBranch })
					.where(eq(worktrees.id, worktreeId))
					.run();
				manager.updateProgress(
					workspaceId,
					progressStep,
					`Using "${result.fallbackBranch}" branch`,
					`Branch "${originalBranch}" not found. Using "${result.fallbackBranch}" instead.`,
				);
			}
			return result.ref;
		};

		let startPoint: string;
		if (hasRemote) {
			const branchCheck = await branchExistsOnRemote(
				mainRepoPath,
				effectiveBaseBranch,
			);

			if (branchCheck.status === "exists") {
				startPoint = `origin/${effectiveBaseBranch}`;
			} else {
				const isNetworkError = branchCheck.status === "error";
				const fallbackReason = isNetworkError
					? sanitizeGitError(branchCheck.message)
					: `Branch "${effectiveBaseBranch}" not found on remote`;

				console.warn(
					`[workspace-init] ${fallbackReason}. Falling back to local ref.`,
				);
				manager.updateProgress(
					workspaceId,
					"verifying",
					isNetworkError
						? "Using local reference (remote unavailable)"
						: "Using local reference (not on remote)",
					fallbackReason,
				);

				const ref = await resolveLocalRef({
					reason: isNetworkError ? "Remote unavailable" : "Not found on remote",
					checkOriginRefs: true,
					progressStep: "verifying",
				});
				if (!ref) {
					const failureDetail = isNetworkError
						? "Cannot reach remote"
						: "Does not exist on remote";
					manager.updateProgress(
						workspaceId,
						"failed",
						"No local reference available",
						baseBranchWasExplicit
							? `${failureDetail} and branch "${effectiveBaseBranch}" doesn't exist locally.${isNetworkError ? " Please check your network connection and try again." : " Please try again with a different base branch."}`
							: `${failureDetail} and no local ref for "${effectiveBaseBranch}" exists.${isNetworkError ? " Please check your network connection and try again." : ""}`,
					);
					return;
				}
				startPoint = ref;
			}
		} else {
			const ref = await resolveLocalRef({
				reason: "No remote configured",
				checkOriginRefs: false,
				progressStep: "verifying",
			});
			if (!ref) {
				manager.updateProgress(
					workspaceId,
					"failed",
					"No local reference available",
					baseBranchWasExplicit
						? `No remote configured and branch "${effectiveBaseBranch}" doesn't exist locally.`
						: `No remote configured and no local ref for "${effectiveBaseBranch}" exists.`,
				);
				return;
			}
			startPoint = ref;
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
			} catch (fetchError) {
				const originRef = `origin/${effectiveBaseBranch}`;
				if (!(await refExistsLocally(mainRepoPath, originRef))) {
					console.warn(
						`[workspace-init] Fetch failed and local ref "${originRef}" doesn't exist. Attempting local fallback.`,
					);
					const ref = await resolveLocalRef({
						reason: "Fetch failed and remote tracking ref unavailable",
						checkOriginRefs: true,
						progressStep: "fetching",
					});
					if (!ref) {
						const sanitizedError = sanitizeGitError(
							fetchError instanceof Error
								? fetchError.message
								: String(fetchError),
						);
						manager.updateProgress(
							workspaceId,
							"failed",
							"Cannot fetch branch",
							`Failed to fetch "${effectiveBaseBranch}" and no local reference exists. ` +
								`Please check your network connection or try running "git fetch origin ${effectiveBaseBranch}" manually. ` +
								`Error: ${sanitizedError}`,
						);
						return;
					}
					startPoint = ref;
				}
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
					ahead: 0,
					behind: 0,
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
