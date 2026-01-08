import { eq } from "drizzle-orm";
import { projects, worktrees } from "@superset/local-db";
import { track } from "main/lib/analytics";
import { localDb } from "main/lib/local-db";
import { workspaceInitManager } from "main/lib/workspace-init-manager";
import {
	branchExistsOnRemote,
	createWorktree,
	fetchDefaultBranch,
	hasOriginRemote,
	refExistsLocally,
	refreshDefaultBranch,
	removeWorktree,
	sanitizeGitError,
} from "./git";
import { copySupersetConfigToWorktree } from "./setup";

interface InitWorktreeParams {
	workspaceId: string;
	projectId: string;
	worktreeId: string;
	worktreePath: string;
	branch: string;
	baseBranch: string;
	/** If true, user explicitly specified baseBranch - don't auto-update it */
	baseBranchWasExplicit: boolean;
	mainRepoPath: string;
}

/**
 * Creates a context object for managing workspace initialization.
 * Centralizes cancellation checks and cleanup logic.
 */
function createInitContext({
	workspaceId,
	mainRepoPath,
	worktreePath,
}: {
	workspaceId: string;
	mainRepoPath: string;
	worktreePath: string;
}) {
	const manager = workspaceInitManager;

	return {
		manager,

		/**
		 * Check if cancellation was requested.
		 * Does NOT emit "failed" progress - when cancelled for deletion, the workspace
		 * is being removed anyway and emitting would trigger a race condition where
		 * the subscription refetches stale data before deletion completes.
		 */
		isCancelled: () => manager.isCancellationRequested(workspaceId),

		/**
		 * Cleanup worktree if it was created. Safe to call multiple times.
		 */
		cleanup: async () => {
			if (manager.wasWorktreeCreated(workspaceId)) {
				try {
					await removeWorktree(mainRepoPath, worktreePath);
					console.log(
						`[workspace-init] Cleaned up worktree at ${worktreePath}`,
					);
				} catch (e) {
					console.error("[workspace-init] Failed to cleanup worktree:", e);
				}
			}
		},

		/**
		 * Update progress for this workspace.
		 */
		progress: (
			step: Parameters<typeof manager.updateProgress>[1],
			message: string,
			error?: string,
		) => {
			manager.updateProgress(workspaceId, step, message, error);
		},

		/**
		 * Mark that worktree was created (for cleanup tracking).
		 */
		markWorktreeCreated: () => manager.markWorktreeCreated(workspaceId),
	};
}

/**
 * Resolve a local git reference with proper fallback order.
 * Tries: origin/<branch> (local tracking) > local branch > null
 */
async function resolveLocalStartPoint({
	mainRepoPath,
	branch,
	reason,
}: {
	mainRepoPath: string;
	branch: string;
	reason: string;
}): Promise<string | null> {
	const originRef = `origin/${branch}`;
	if (await refExistsLocally(mainRepoPath, originRef)) {
		console.log(
			`[workspace-init] ${reason}. Using local tracking ref: ${originRef}`,
		);
		return originRef;
	}
	if (await refExistsLocally(mainRepoPath, branch)) {
		console.log(`[workspace-init] ${reason}. Using local branch: ${branch}`);
		return branch;
	}
	return null;
}

/**
 * Step 1: Sync with remote and update base branch if needed.
 * Returns the effective base branch to use.
 */
async function syncWithRemote({
	ctx,
	projectId,
	worktreeId,
	baseBranch,
	baseBranchWasExplicit,
	mainRepoPath,
}: {
	ctx: ReturnType<typeof createInitContext>;
	projectId: string;
	worktreeId: string;
	baseBranch: string;
	baseBranchWasExplicit: boolean;
	mainRepoPath: string;
}): Promise<string> {
	ctx.progress("syncing", "Syncing with remote...");

	const remoteDefaultBranch = await refreshDefaultBranch(mainRepoPath);
	let effectiveBaseBranch = baseBranch;

	if (remoteDefaultBranch) {
		// Update project's default branch if it changed
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

		// If baseBranch was auto-derived and differs from remote, update it
		if (!baseBranchWasExplicit && remoteDefaultBranch !== baseBranch) {
			console.log(
				`[workspace-init] Auto-updating baseBranch from "${baseBranch}" to "${remoteDefaultBranch}"`,
			);
			effectiveBaseBranch = remoteDefaultBranch;
			localDb
				.update(worktrees)
				.set({ baseBranch: remoteDefaultBranch })
				.where(eq(worktrees.id, worktreeId))
				.run();
		}
	}

	return effectiveBaseBranch;
}

/**
 * Step 2: Verify remote and determine start point for worktree.
 * Returns the git ref to use as start point, or null if verification failed.
 */
async function verifyAndResolveStartPoint({
	ctx,
	effectiveBaseBranch,
	mainRepoPath,
}: {
	ctx: ReturnType<typeof createInitContext>;
	effectiveBaseBranch: string;
	mainRepoPath: string;
}): Promise<string | null> {
	ctx.progress("verifying", "Verifying base branch...");

	const hasRemote = await hasOriginRemote(mainRepoPath);

	if (!hasRemote) {
		const localRef = await resolveLocalStartPoint({
			mainRepoPath,
			branch: effectiveBaseBranch,
			reason: "No remote configured",
		});
		if (!localRef) {
			ctx.progress(
				"failed",
				"No local reference available",
				`No remote configured and no local ref for "${effectiveBaseBranch}" exists.`,
			);
			return null;
		}
		return localRef;
	}

	const branchCheck = await branchExistsOnRemote(
		mainRepoPath,
		effectiveBaseBranch,
	);

	if (branchCheck.status === "error") {
		// Network/auth error - try local fallback
		const sanitizedError = sanitizeGitError(branchCheck.message);
		console.warn(
			`[workspace-init] Cannot verify remote branch: ${sanitizedError}. Falling back to local ref.`,
		);
		ctx.progress(
			"verifying",
			"Using local reference (remote unavailable)",
			sanitizedError,
		);

		const localRef = await resolveLocalStartPoint({
			mainRepoPath,
			branch: effectiveBaseBranch,
			reason: "Remote unavailable",
		});
		if (!localRef) {
			ctx.progress(
				"failed",
				"No local reference available",
				`Cannot reach remote and no local ref for "${effectiveBaseBranch}" exists. Please check your network connection and try again.`,
			);
			return null;
		}
		return localRef;
	}

	if (branchCheck.status === "not_found") {
		ctx.progress(
			"failed",
			"Branch does not exist on remote",
			`Branch "${effectiveBaseBranch}" does not exist on origin. Please delete this workspace and try again with a different base branch.`,
		);
		return null;
	}

	// Branch exists on remote
	return `origin/${effectiveBaseBranch}`;
}

/**
 * Step 3: Fetch latest changes from remote.
 */
async function fetchLatest({
	ctx,
	effectiveBaseBranch,
	mainRepoPath,
}: {
	ctx: ReturnType<typeof createInitContext>;
	effectiveBaseBranch: string;
	mainRepoPath: string;
}): Promise<void> {
	ctx.progress("fetching", "Fetching latest changes...");

	const hasRemote = await hasOriginRemote(mainRepoPath);
	if (hasRemote) {
		try {
			await fetchDefaultBranch(mainRepoPath, effectiveBaseBranch);
		} catch {
			// Silently continue - branch exists on remote, just couldn't fetch
		}
	}
}

/**
 * Step 4: Create the git worktree.
 */
async function createWorktreeStep({
	ctx,
	branch,
	worktreePath,
	startPoint,
	mainRepoPath,
}: {
	ctx: ReturnType<typeof createInitContext>;
	branch: string;
	worktreePath: string;
	startPoint: string;
	mainRepoPath: string;
}): Promise<void> {
	ctx.progress("creating_worktree", "Creating git worktree...");
	await createWorktree(mainRepoPath, branch, worktreePath, startPoint);
	ctx.markWorktreeCreated();
}

/**
 * Step 5: Copy configuration files.
 */
function copyConfig({
	ctx,
	mainRepoPath,
	worktreePath,
}: {
	ctx: ReturnType<typeof createInitContext>;
	mainRepoPath: string;
	worktreePath: string;
}): void {
	ctx.progress("copying_config", "Copying configuration...");
	copySupersetConfigToWorktree(mainRepoPath, worktreePath);
}

/**
 * Step 6: Finalize and update database.
 */
function finalize({
	ctx,
	workspaceId,
	projectId,
	worktreeId,
	branch,
	effectiveBaseBranch,
}: {
	ctx: ReturnType<typeof createInitContext>;
	workspaceId: string;
	projectId: string;
	worktreeId: string;
	branch: string;
	effectiveBaseBranch: string;
}): void {
	ctx.progress("finalizing", "Finalizing setup...");

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

	ctx.progress("ready", "Ready");

	track("workspace_initialized", {
		workspace_id: workspaceId,
		project_id: projectId,
		branch,
		base_branch: effectiveBaseBranch,
	});
}

/**
 * Background initialization for workspace worktree.
 * Runs after the fast-path mutation returns, streaming progress to the renderer.
 *
 * Does NOT throw - errors are communicated via progress events.
 */
export async function initializeWorkspaceWorktree(
	params: InitWorktreeParams,
): Promise<void> {
	const {
		workspaceId,
		projectId,
		worktreeId,
		worktreePath,
		branch,
		baseBranch,
		baseBranchWasExplicit,
		mainRepoPath,
	} = params;

	const ctx = createInitContext({ workspaceId, mainRepoPath, worktreePath });

	try {
		await ctx.manager.acquireProjectLock(projectId);

		// Step 1: Sync with remote
		if (ctx.isCancelled()) return;
		const effectiveBaseBranch = await syncWithRemote({
			ctx,
			projectId,
			worktreeId,
			baseBranch,
			baseBranchWasExplicit,
			mainRepoPath,
		});

		// Step 2: Verify and resolve start point
		if (ctx.isCancelled()) return;
		const startPoint = await verifyAndResolveStartPoint({
			ctx,
			effectiveBaseBranch,
			mainRepoPath,
		});
		if (!startPoint) return; // Error already reported via progress

		// Step 3: Fetch latest
		if (ctx.isCancelled()) return;
		await fetchLatest({ ctx, effectiveBaseBranch, mainRepoPath });

		// Step 4: Create worktree (after this point, cleanup is needed on cancel)
		if (ctx.isCancelled()) return;
		await createWorktreeStep({
			ctx,
			branch,
			worktreePath,
			startPoint,
			mainRepoPath,
		});

		// Step 5: Copy config
		if (ctx.isCancelled()) {
			await ctx.cleanup();
			return;
		}
		copyConfig({ ctx, mainRepoPath, worktreePath });

		// Step 6: Finalize
		if (ctx.isCancelled()) {
			await ctx.cleanup();
			return;
		}
		finalize({
			ctx,
			workspaceId,
			projectId,
			worktreeId,
			branch,
			effectiveBaseBranch,
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(
			`[workspace-init] Failed to initialize ${workspaceId}:`,
			errorMessage,
		);

		await ctx.cleanup();
		ctx.progress("failed", "Initialization failed", errorMessage);
	} finally {
		// Always finalize the job to unblock waitForInit() callers (e.g., delete mutation)
		ctx.manager.finalizeJob(workspaceId);
		ctx.manager.releaseProjectLock(projectId);
	}
}
