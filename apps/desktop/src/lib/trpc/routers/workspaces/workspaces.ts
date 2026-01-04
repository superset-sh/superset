import { homedir } from "node:os";
import { join } from "node:path";
import {
	projects,
	type SelectWorktree,
	settings,
	workspaces,
	worktrees,
} from "@superset/local-db";
import { observable } from "@trpc/server/observable";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { track } from "main/lib/analytics";
import { localDb } from "main/lib/local-db";
import { terminalManager } from "main/lib/terminal";
import { workspaceInitManager } from "main/lib/workspace-init-manager";
import { SUPERSET_DIR_NAME, WORKTREES_DIR_NAME } from "shared/constants";
import type { WorkspaceInitProgress } from "shared/types/workspace-init";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	branchExistsOnRemote,
	checkNeedsRebase,
	createWorktree,
	detectBaseBranch,
	fetchDefaultBranch,
	generateBranchName,
	getCurrentBranch,
	getDefaultBranch,
	hasOriginRemote,
	hasUncommittedChanges,
	hasUnpushedCommits,
	listBranches,
	refExistsLocally,
	refreshDefaultBranch,
	removeWorktree,
	safeCheckoutBranch,
	sanitizeGitError,
	worktreeExists,
} from "./utils/git";
import { fetchGitHubPRStatus } from "./utils/github";
import { copySupersetConfigToWorktree, loadSetupConfig } from "./utils/setup";
import { runTeardown } from "./utils/teardown";
import { getWorkspacePath } from "./utils/worktree";

/**
 * Background initialization for workspace worktree.
 * This runs after the fast-path mutation returns, streaming progress to the renderer.
 *
 * Does NOT throw - errors are communicated via progress events.
 */
async function initializeWorkspaceWorktree({
	workspaceId,
	projectId,
	worktreeId,
	worktreePath,
	branch,
	baseBranch,
	baseBranchWasExplicit,
	mainRepoPath,
}: {
	workspaceId: string;
	projectId: string;
	worktreeId: string;
	worktreePath: string;
	branch: string;
	baseBranch: string;
	/** If true, user explicitly specified baseBranch - don't auto-update it */
	baseBranchWasExplicit: boolean;
	mainRepoPath: string;
}): Promise<void> {
	const manager = workspaceInitManager;

	try {
		// Acquire per-project lock to prevent concurrent git operations
		await manager.acquireProjectLock(projectId);

		// Check cancellation before starting (use durable cancellation check)
		if (manager.isCancellationRequested(workspaceId)) {
			manager.updateProgress(workspaceId, "failed", "Cancelled");
			return;
		}

		// Step 1: Sync with remote
		manager.updateProgress(workspaceId, "syncing", "Syncing with remote...");
		const remoteDefaultBranch = await refreshDefaultBranch(mainRepoPath);

		// Track the effective baseBranch - may be updated if auto-derived and remote differs
		let effectiveBaseBranch = baseBranch;

		// Update project's default branch if it changed
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
			manager.updateProgress(workspaceId, "failed", "Cancelled");
			return;
		}

		// Step 2: Verify remote and branch
		manager.updateProgress(
			workspaceId,
			"verifying",
			"Verifying base branch...",
		);
		const hasRemote = await hasOriginRemote(mainRepoPath);

		// Helper to resolve local ref with proper fallback order
		const resolveLocalStartPoint = async (
			reason: string,
		): Promise<string | null> => {
			// Fallback order: origin/<branch> (local tracking) > local branch > fail
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
				// Network/auth error - can't verify, surface to user and try local fallback
				const sanitizedError = sanitizeGitError(branchCheck.message);
				console.warn(
					`[workspace-init] Cannot verify remote branch: ${sanitizedError}. Falling back to local ref.`,
				);

				// Update progress to inform user about the network issue
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
				// Branch exists on remote - use remote tracking ref
				startPoint = `origin/${effectiveBaseBranch}`;
			}
		} else {
			// No remote configured - use local fallback logic
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
			manager.updateProgress(workspaceId, "failed", "Cancelled");
			return;
		}

		// Step 3: Fetch latest
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
			manager.updateProgress(workspaceId, "failed", "Cancelled");
			return;
		}

		// Step 4: Create worktree (SLOW)
		manager.updateProgress(
			workspaceId,
			"creating_worktree",
			"Creating git worktree...",
		);
		await createWorktree(mainRepoPath, branch, worktreePath, startPoint);
		manager.markWorktreeCreated(workspaceId);

		if (manager.isCancellationRequested(workspaceId)) {
			// Cleanup: remove the worktree we just created
			try {
				await removeWorktree(mainRepoPath, worktreePath);
			} catch (e) {
				console.error(
					"[workspace-init] Failed to cleanup worktree after cancel:",
					e,
				);
			}
			manager.updateProgress(workspaceId, "failed", "Cancelled");
			return;
		}

		// Step 5: Copy config
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
			manager.updateProgress(workspaceId, "failed", "Cancelled");
			return;
		}

		// Step 6: Finalize
		manager.updateProgress(workspaceId, "finalizing", "Finalizing setup...");

		// Update worktree record with git status
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

		// Best-effort cleanup if worktree was created
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

export const createWorkspacesRouter = () => {
	return router({
		create: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					name: z.string().optional(),
					branchName: z.string().optional(),
					baseBranch: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) {
					throw new Error(`Project ${input.projectId} not found`);
				}

				const branch = input.branchName?.trim() || generateBranchName();

				const worktreePath = join(
					homedir(),
					SUPERSET_DIR_NAME,
					WORKTREES_DIR_NAME,
					project.name,
					branch,
				);

				// Use cached defaultBranch for fast path, will refresh in background
				// If no cached value exists, use "main" as fallback (background will verify)
				const defaultBranch = project.defaultBranch || "main";
				const targetBranch = input.baseBranch || defaultBranch;

				// Insert worktree record immediately (before git operations)
				// gitStatus will be updated when initialization completes
				const worktree = localDb
					.insert(worktrees)
					.values({
						projectId: input.projectId,
						path: worktreePath,
						branch,
						baseBranch: targetBranch,
						gitStatus: null, // Will be set when init completes
					})
					.returning()
					.get();

				// Get max tab order for this project's workspaces
				const projectWorkspaces = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.projectId, input.projectId))
					.all();
				const maxTabOrder =
					projectWorkspaces.length > 0
						? Math.max(...projectWorkspaces.map((w) => w.tabOrder))
						: -1;

				const workspace = localDb
					.insert(workspaces)
					.values({
						projectId: input.projectId,
						worktreeId: worktree.id,
						type: "worktree",
						branch,
						name: input.name ?? branch,
						tabOrder: maxTabOrder + 1,
					})
					.returning()
					.get();

				localDb
					.insert(settings)
					.values({ id: 1, lastActiveWorkspaceId: workspace.id })
					.onConflictDoUpdate({
						target: settings.id,
						set: { lastActiveWorkspaceId: workspace.id },
					})
					.run();

				const activeProjects = localDb
					.select()
					.from(projects)
					.where(isNotNull(projects.tabOrder))
					.all();
				const maxProjectTabOrder =
					activeProjects.length > 0
						? Math.max(...activeProjects.map((p) => p.tabOrder ?? 0))
						: -1;

				localDb
					.update(projects)
					.set({
						lastOpenedAt: Date.now(),
						tabOrder:
							project.tabOrder === null
								? maxProjectTabOrder + 1
								: project.tabOrder,
					})
					.where(eq(projects.id, input.projectId))
					.run();

				// Track workspace creation (not initialization - that's tracked when it completes)
				track("workspace_created", {
					workspace_id: workspace.id,
					project_id: project.id,
					branch: branch,
					base_branch: targetBranch,
				});

				workspaceInitManager.startJob(workspace.id, input.projectId);

				// Start background initialization (DO NOT await - return immediately)
				initializeWorkspaceWorktree({
					workspaceId: workspace.id,
					projectId: input.projectId,
					worktreeId: worktree.id,
					worktreePath,
					branch,
					baseBranch: targetBranch,
					baseBranchWasExplicit: !!input.baseBranch,
					mainRepoPath: project.mainRepoPath,
				});

				// Load setup configuration (fast operation, can return with response)
				const setupConfig = loadSetupConfig(project.mainRepoPath);

				return {
					workspace,
					initialCommands: setupConfig?.setup || null,
					worktreePath,
					projectId: project.id,
					isInitializing: true,
				};
			}),

		createBranchWorkspace: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					branch: z.string().optional(), // If not provided, uses current branch
					name: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) {
					throw new Error(`Project ${input.projectId} not found`);
				}

				// Determine the branch - use provided or get current
				const branch =
					input.branch || (await getCurrentBranch(project.mainRepoPath));
				if (!branch) {
					throw new Error("Could not determine current branch");
				}

				// If a specific branch was requested, check for conflict before checkout
				if (input.branch) {
					const existingBranchWorkspace = localDb
						.select()
						.from(workspaces)
						.where(
							and(
								eq(workspaces.projectId, input.projectId),
								eq(workspaces.type, "branch"),
							),
						)
						.get();
					if (
						existingBranchWorkspace &&
						existingBranchWorkspace.branch !== branch
					) {
						throw new Error(
							`A main workspace already exists on branch "${existingBranchWorkspace.branch}". ` +
								`Use the branch switcher to change branches.`,
						);
					}
					await safeCheckoutBranch(project.mainRepoPath, input.branch);
				}

				// Check if branch workspace already exists
				const existing = localDb
					.select()
					.from(workspaces)
					.where(
						and(
							eq(workspaces.projectId, input.projectId),
							eq(workspaces.type, "branch"),
						),
					)
					.get();

				if (existing) {
					// Activate existing
					localDb
						.update(workspaces)
						.set({ lastOpenedAt: Date.now() })
						.where(eq(workspaces.id, existing.id))
						.run();
					localDb
						.insert(settings)
						.values({ id: 1, lastActiveWorkspaceId: existing.id })
						.onConflictDoUpdate({
							target: settings.id,
							set: { lastActiveWorkspaceId: existing.id },
						})
						.run();
					return {
						workspace: { ...existing, lastOpenedAt: Date.now() },
						worktreePath: project.mainRepoPath,
						projectId: project.id,
						wasExisting: true,
					};
				}

				// Shift existing workspaces to make room at front
				const projectWorkspaces = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.projectId, input.projectId))
					.all();
				for (const ws of projectWorkspaces) {
					localDb
						.update(workspaces)
						.set({ tabOrder: ws.tabOrder + 1 })
						.where(eq(workspaces.id, ws.id))
						.run();
				}

				// Insert new workspace
				const workspace = localDb
					.insert(workspaces)
					.values({
						projectId: input.projectId,
						type: "branch",
						branch,
						name: branch,
						tabOrder: 0,
					})
					.returning()
					.get();

				// Update settings
				localDb
					.insert(settings)
					.values({ id: 1, lastActiveWorkspaceId: workspace.id })
					.onConflictDoUpdate({
						target: settings.id,
						set: { lastActiveWorkspaceId: workspace.id },
					})
					.run();

				// Update project
				const activeProjects = localDb
					.select()
					.from(projects)
					.where(isNotNull(projects.tabOrder))
					.all();
				const maxProjectTabOrder =
					activeProjects.length > 0
						? Math.max(...activeProjects.map((p) => p.tabOrder ?? 0))
						: -1;

				localDb
					.update(projects)
					.set({
						lastOpenedAt: Date.now(),
						tabOrder:
							project.tabOrder === null
								? maxProjectTabOrder + 1
								: project.tabOrder,
					})
					.where(eq(projects.id, input.projectId))
					.run();

				track("workspace_opened", {
					workspace_id: workspace.id,
					project_id: project.id,
					type: "branch",
					was_existing: false,
				});

				return {
					workspace,
					worktreePath: project.mainRepoPath,
					projectId: project.id,
					wasExisting: false,
				};
			}),

		getBranches: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					fetch: z.boolean().optional(), // Whether to fetch remote refs (default: false, avoids UI stalls)
				}),
			)
			.query(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) {
					throw new Error(`Project ${input.projectId} not found`);
				}

				const branches = await listBranches(project.mainRepoPath, {
					fetch: input.fetch,
				});

				// Get branches that are in use by worktrees, with their workspace IDs
				const projectWorkspaces = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.projectId, input.projectId))
					.all();
				const worktreeBranchMap: Record<string, string> = {};
				for (const ws of projectWorkspaces) {
					if (ws.type === "worktree" && ws.branch) {
						worktreeBranchMap[ws.branch] = ws.id;
					}
				}

				return {
					...branches,
					inUse: Object.keys(worktreeBranchMap),
					inUseWorkspaces: worktreeBranchMap, // branch -> workspaceId
				};
			}),

		// Switch an existing branch workspace to a different branch
		switchBranchWorkspace: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					branch: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();
				if (!project) {
					throw new Error(`Project ${input.projectId} not found`);
				}

				const workspace = localDb
					.select()
					.from(workspaces)
					.where(
						and(
							eq(workspaces.projectId, input.projectId),
							eq(workspaces.type, "branch"),
						),
					)
					.get();
				if (!workspace) {
					throw new Error("No branch workspace found for this project");
				}

				// Checkout the new branch with safety checks (terminals continue running on the new branch)
				await safeCheckoutBranch(project.mainRepoPath, input.branch);

				// Send newline to terminals so their prompts refresh with new branch
				terminalManager.refreshPromptsForWorkspace(workspace.id);

				// Update the workspace - name is always the branch for branch workspaces
				const now = Date.now();
				localDb
					.update(workspaces)
					.set({
						branch: input.branch,
						name: input.branch,
						updatedAt: now,
						lastOpenedAt: now,
					})
					.where(eq(workspaces.id, workspace.id))
					.run();

				localDb
					.insert(settings)
					.values({ id: 1, lastActiveWorkspaceId: workspace.id })
					.onConflictDoUpdate({
						target: settings.id,
						set: { lastActiveWorkspaceId: workspace.id },
					})
					.run();

				const updatedWorkspace = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.id, workspace.id))
					.get();
				if (!updatedWorkspace) {
					throw new Error(`Workspace ${workspace.id} not found after update`);
				}

				return {
					workspace: updatedWorkspace,
					worktreePath: project.mainRepoPath,
				};
			}),

		get: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }) => {
				const workspace = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.id, input.id))
					.get();
				if (!workspace) {
					throw new Error(`Workspace ${input.id} not found`);
				}
				return workspace;
			}),

		getAll: publicProcedure.query(() => {
			return localDb
				.select()
				.from(workspaces)
				.all()
				.sort((a, b) => a.tabOrder - b.tabOrder);
		}),

		getAllGrouped: publicProcedure.query(() => {
			const activeProjects = localDb
				.select()
				.from(projects)
				.where(isNotNull(projects.tabOrder))
				.all();

			const groupsMap = new Map<
				string,
				{
					project: {
						id: string;
						name: string;
						color: string;
						tabOrder: number;
					};
					workspaces: Array<{
						id: string;
						projectId: string;
						worktreeId: string | null;
						worktreePath: string;
						type: "worktree" | "branch";
						branch: string;
						name: string;
						tabOrder: number;
						createdAt: number;
						updatedAt: number;
						lastOpenedAt: number;
					}>;
				}
			>();

			for (const project of activeProjects) {
				groupsMap.set(project.id, {
					project: {
						id: project.id,
						name: project.name,
						color: project.color,
						// biome-ignore lint/style/noNonNullAssertion: filter guarantees tabOrder is not null
						tabOrder: project.tabOrder!,
					},
					workspaces: [],
				});
			}

			const allWorkspaces = localDb
				.select()
				.from(workspaces)
				.all()
				.sort((a, b) => a.tabOrder - b.tabOrder);

			for (const workspace of allWorkspaces) {
				if (groupsMap.has(workspace.projectId)) {
					groupsMap.get(workspace.projectId)?.workspaces.push({
						...workspace,
						type: workspace.type as "worktree" | "branch",
						worktreePath: getWorkspacePath(workspace) ?? "",
					});
				}
			}

			return Array.from(groupsMap.values()).sort(
				(a, b) => a.project.tabOrder - b.project.tabOrder,
			);
		}),

		getActive: publicProcedure.query(async () => {
			const settingsRow = localDb.select().from(settings).get();
			const lastActiveWorkspaceId = settingsRow?.lastActiveWorkspaceId;

			if (!lastActiveWorkspaceId) {
				return null;
			}

			const workspace = localDb
				.select()
				.from(workspaces)
				.where(eq(workspaces.id, lastActiveWorkspaceId))
				.get();
			if (!workspace) {
				throw new Error(
					`Active workspace ${lastActiveWorkspaceId} not found in database`,
				);
			}

			const project = localDb
				.select()
				.from(projects)
				.where(eq(projects.id, workspace.projectId))
				.get();
			const worktree = workspace.worktreeId
				? localDb
						.select()
						.from(worktrees)
						.where(eq(worktrees.id, workspace.worktreeId))
						.get()
				: null;

			// Detect and persist base branch for existing worktrees that don't have it
			// We use undefined to mean "not yet attempted" and null to mean "attempted but not found"
			let baseBranch = worktree?.baseBranch;
			if (worktree && baseBranch === undefined && project) {
				// Only attempt detection if there's a remote origin
				const hasRemote = await hasOriginRemote(project.mainRepoPath);
				if (hasRemote) {
					try {
						const defaultBranch = project.defaultBranch || "main";
						const detected = await detectBaseBranch(
							worktree.path,
							worktree.branch,
							defaultBranch,
						);
						if (detected) {
							baseBranch = detected;
						}
						// Persist the result (detected branch or null sentinel)
						localDb
							.update(worktrees)
							.set({ baseBranch: detected ?? null })
							.where(eq(worktrees.id, worktree.id))
							.run();
					} catch {
						// Detection failed, persist null to avoid retrying
						localDb
							.update(worktrees)
							.set({ baseBranch: null })
							.where(eq(worktrees.id, worktree.id))
							.run();
					}
				} else {
					// No remote - persist null to avoid retrying
					localDb
						.update(worktrees)
						.set({ baseBranch: null })
						.where(eq(worktrees.id, worktree.id))
						.run();
				}
			}

			return {
				...workspace,
				type: workspace.type as "worktree" | "branch",
				worktreePath: getWorkspacePath(workspace) ?? "",
				project: project
					? {
							id: project.id,
							name: project.name,
							mainRepoPath: project.mainRepoPath,
						}
					: null,
				worktree: worktree
					? {
							branch: worktree.branch,
							baseBranch,
							// Normalize to null to ensure consistent "incomplete init" detection in UI
							gitStatus: worktree.gitStatus ?? null,
						}
					: null,
			};
		}),

		update: publicProcedure
			.input(
				z.object({
					id: z.string(),
					patch: z.object({
						name: z.string().optional(),
					}),
				}),
			)
			.mutation(({ input }) => {
				const workspace = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.id, input.id))
					.get();
				if (!workspace) {
					throw new Error(`Workspace ${input.id} not found`);
				}

				const now = Date.now();
				localDb
					.update(workspaces)
					.set({
						...(input.patch.name !== undefined && { name: input.patch.name }),
						updatedAt: now,
						lastOpenedAt: now,
					})
					.where(eq(workspaces.id, input.id))
					.run();

				return { success: true };
			}),

		canDelete: publicProcedure
			.input(
				z.object({
					id: z.string(),
					// Skip expensive git checks (status, unpushed) during polling - only check terminal count
					skipGitChecks: z.boolean().optional(),
				}),
			)
			.query(async ({ input }) => {
				const workspace = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.id, input.id))
					.get();

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
					terminalManager.getSessionCountByWorkspaceId(input.id);

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
					? localDb
							.select()
							.from(worktrees)
							.where(eq(worktrees.id, workspace.worktreeId))
							.get()
					: null;
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, workspace.projectId))
					.get();

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
				const workspace = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.id, input.id))
					.get();

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
				const terminalResult = await terminalManager.killByWorkspaceId(
					input.id,
				);

				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, workspace.projectId))
					.get();

				let worktree: SelectWorktree | undefined;

				// Branch workspaces don't have worktrees - skip worktree operations
				if (workspace.type === "worktree" && workspace.worktreeId) {
					worktree =
						localDb
							.select()
							.from(worktrees)
							.where(eq(worktrees.id, workspace.worktreeId))
							.get() ?? undefined;

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
								runTeardown(
									project.mainRepoPath,
									worktree.path,
									workspace.name,
								).then((result) => {
									if (!result.success) {
										console.error(
											`Teardown failed for workspace ${workspace.name}:`,
											result.error,
										);
									}
								});
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
				localDb.delete(workspaces).where(eq(workspaces.id, input.id)).run();

				if (worktree) {
					localDb.delete(worktrees).where(eq(worktrees.id, worktree.id)).run();
				}

				if (project) {
					const remainingWorkspaces = localDb
						.select()
						.from(workspaces)
						.where(eq(workspaces.projectId, workspace.projectId))
						.all();
					if (remainingWorkspaces.length === 0) {
						localDb
							.update(projects)
							.set({ tabOrder: null })
							.where(eq(projects.id, workspace.projectId))
							.run();
					}
				}

				const settingsRow = localDb.select().from(settings).get();
				if (settingsRow?.lastActiveWorkspaceId === input.id) {
					const sorted = localDb
						.select()
						.from(workspaces)
						.orderBy(desc(workspaces.lastOpenedAt))
						.all();
					const newActiveId = sorted[0]?.id ?? null;
					localDb
						.insert(settings)
						.values({ id: 1, lastActiveWorkspaceId: newActiveId })
						.onConflictDoUpdate({
							target: settings.id,
							set: { lastActiveWorkspaceId: newActiveId },
						})
						.run();
				}

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

		setActive: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				const workspace = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.id, input.id))
					.get();
				if (!workspace) {
					throw new Error(`Workspace ${input.id} not found`);
				}

				const now = Date.now();
				localDb
					.update(workspaces)
					.set({ lastOpenedAt: now, updatedAt: now })
					.where(eq(workspaces.id, input.id))
					.run();

				localDb
					.insert(settings)
					.values({ id: 1, lastActiveWorkspaceId: input.id })
					.onConflictDoUpdate({
						target: settings.id,
						set: { lastActiveWorkspaceId: input.id },
					})
					.run();

				return { success: true };
			}),

		reorder: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					fromIndex: z.number(),
					toIndex: z.number(),
				}),
			)
			.mutation(({ input }) => {
				const { projectId, fromIndex, toIndex } = input;

				const projectWorkspaces = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.projectId, projectId))
					.all()
					.sort((a, b) => a.tabOrder - b.tabOrder);

				if (
					fromIndex < 0 ||
					fromIndex >= projectWorkspaces.length ||
					toIndex < 0 ||
					toIndex >= projectWorkspaces.length
				) {
					throw new Error("Invalid fromIndex or toIndex");
				}

				const [removed] = projectWorkspaces.splice(fromIndex, 1);
				projectWorkspaces.splice(toIndex, 0, removed);

				for (let i = 0; i < projectWorkspaces.length; i++) {
					localDb
						.update(workspaces)
						.set({ tabOrder: i })
						.where(eq(workspaces.id, projectWorkspaces[i].id))
						.run();
				}

				return { success: true };
			}),

		refreshGitStatus: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.mutation(async ({ input }) => {
				const workspace = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.id, input.workspaceId))
					.get();
				if (!workspace) {
					throw new Error(`Workspace ${input.workspaceId} not found`);
				}

				const worktree = workspace.worktreeId
					? localDb
							.select()
							.from(worktrees)
							.where(eq(worktrees.id, workspace.worktreeId))
							.get()
					: null;
				if (!worktree) {
					throw new Error(
						`Worktree for workspace ${input.workspaceId} not found`,
					);
				}

				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, workspace.projectId))
					.get();
				if (!project) {
					throw new Error(`Project ${workspace.projectId} not found`);
				}

				// Sync with remote in case the default branch changed (e.g. master -> main)
				const remoteDefaultBranch = await refreshDefaultBranch(
					project.mainRepoPath,
				);

				let defaultBranch = project.defaultBranch;
				if (!defaultBranch) {
					defaultBranch = await getDefaultBranch(project.mainRepoPath);
				}
				if (remoteDefaultBranch && remoteDefaultBranch !== defaultBranch) {
					defaultBranch = remoteDefaultBranch;
				}

				if (defaultBranch !== project.defaultBranch) {
					localDb
						.update(projects)
						.set({ defaultBranch })
						.where(eq(projects.id, project.id))
						.run();
				}

				// Fetch default branch to get latest
				await fetchDefaultBranch(project.mainRepoPath, defaultBranch);

				// Check if worktree branch is behind origin/{defaultBranch}
				const needsRebase = await checkNeedsRebase(
					worktree.path,
					defaultBranch,
				);

				const gitStatus = {
					branch: worktree.branch,
					needsRebase,
					lastRefreshed: Date.now(),
				};

				// Update worktree in db
				localDb
					.update(worktrees)
					.set({ gitStatus })
					.where(eq(worktrees.id, worktree.id))
					.run();

				return { gitStatus, defaultBranch };
			}),

		getGitHubStatus: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(async ({ input }) => {
				const workspace = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.id, input.workspaceId))
					.get();
				if (!workspace) {
					return null;
				}

				const worktree = workspace.worktreeId
					? localDb
							.select()
							.from(worktrees)
							.where(eq(worktrees.id, workspace.worktreeId))
							.get()
					: null;
				if (!worktree) {
					return null;
				}

				// Always fetch fresh data on hover
				const freshStatus = await fetchGitHubPRStatus(worktree.path);

				// Update cache if we got data
				if (freshStatus) {
					localDb
						.update(worktrees)
						.set({ githubStatus: freshStatus })
						.where(eq(worktrees.id, worktree.id))
						.run();
				}

				return freshStatus;
			}),

		getWorktreeInfo: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.query(({ input }) => {
				const workspace = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.id, input.workspaceId))
					.get();
				if (!workspace) {
					return null;
				}

				const worktree = workspace.worktreeId
					? localDb
							.select()
							.from(worktrees)
							.where(eq(worktrees.id, workspace.worktreeId))
							.get()
					: null;
				if (!worktree) {
					return null;
				}

				// Extract worktree name from path (last segment)
				const worktreeName = worktree.path.split("/").pop() ?? worktree.branch;

				return {
					worktreeName,
					createdAt: worktree.createdAt,
					gitStatus: worktree.gitStatus ?? null,
					githubStatus: worktree.githubStatus ?? null,
				};
			}),

		getWorktreesByProject: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(({ input }) => {
				const projectWorktrees = localDb
					.select()
					.from(worktrees)
					.where(eq(worktrees.projectId, input.projectId))
					.all();

				return projectWorktrees.map((wt) => {
					const workspace = localDb
						.select()
						.from(workspaces)
						.where(eq(workspaces.worktreeId, wt.id))
						.get();
					return {
						...wt,
						hasActiveWorkspace: workspace !== undefined,
						workspace: workspace ?? null,
					};
				});
			}),

		openWorktree: publicProcedure
			.input(
				z.object({
					worktreeId: z.string(),
					name: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const worktree = localDb
					.select()
					.from(worktrees)
					.where(eq(worktrees.id, input.worktreeId))
					.get();
				if (!worktree) {
					throw new Error(`Worktree ${input.worktreeId} not found`);
				}

				// Check if worktree already has an active workspace
				const existingWorkspace = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.worktreeId, input.worktreeId))
					.get();
				if (existingWorkspace) {
					throw new Error("Worktree already has an active workspace");
				}

				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, worktree.projectId))
					.get();
				if (!project) {
					throw new Error(`Project ${worktree.projectId} not found`);
				}

				// Verify worktree still exists on disk
				const exists = await worktreeExists(
					project.mainRepoPath,
					worktree.path,
				);
				if (!exists) {
					throw new Error("Worktree no longer exists on disk");
				}

				const projectWorkspaces = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.projectId, worktree.projectId))
					.all();
				const maxTabOrder =
					projectWorkspaces.length > 0
						? Math.max(...projectWorkspaces.map((w) => w.tabOrder))
						: -1;

				// Insert workspace
				const workspace = localDb
					.insert(workspaces)
					.values({
						projectId: worktree.projectId,
						worktreeId: worktree.id,
						type: "worktree",
						branch: worktree.branch,
						name: input.name ?? worktree.branch,
						tabOrder: maxTabOrder + 1,
					})
					.returning()
					.get();

				// Update settings
				localDb
					.insert(settings)
					.values({ id: 1, lastActiveWorkspaceId: workspace.id })
					.onConflictDoUpdate({
						target: settings.id,
						set: { lastActiveWorkspaceId: workspace.id },
					})
					.run();

				// Update project
				const activeProjects = localDb
					.select()
					.from(projects)
					.where(isNotNull(projects.tabOrder))
					.all();
				const maxProjectTabOrder =
					activeProjects.length > 0
						? Math.max(...activeProjects.map((p) => p.tabOrder ?? 0))
						: -1;

				localDb
					.update(projects)
					.set({
						lastOpenedAt: Date.now(),
						tabOrder:
							project.tabOrder === null
								? maxProjectTabOrder + 1
								: project.tabOrder,
					})
					.where(eq(projects.id, worktree.projectId))
					.run();

				// Load setup configuration from the main repo
				const setupConfig = loadSetupConfig(project.mainRepoPath);

				track("workspace_opened", {
					workspace_id: workspace.id,
					project_id: project.id,
					type: "worktree",
				});

				return {
					workspace,
					initialCommands: setupConfig?.setup || null,
					worktreePath: worktree.path,
					projectId: project.id,
				};
			}),

		close: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				const workspace = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.id, input.id))
					.get();

				if (!workspace) {
					throw new Error("Workspace not found");
				}

				const terminalResult = await terminalManager.killByWorkspaceId(
					input.id,
				);

				// Delete workspace record ONLY, keep worktree
				localDb.delete(workspaces).where(eq(workspaces.id, input.id)).run();

				// Check if project should be hidden (no more open workspaces)
				const remainingWorkspaces = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.projectId, workspace.projectId))
					.all();
				if (remainingWorkspaces.length === 0) {
					localDb
						.update(projects)
						.set({ tabOrder: null })
						.where(eq(projects.id, workspace.projectId))
						.run();
				}

				// Update active workspace if this was the active one
				const settingsRow = localDb.select().from(settings).get();
				if (settingsRow?.lastActiveWorkspaceId === input.id) {
					const sorted = localDb
						.select()
						.from(workspaces)
						.orderBy(desc(workspaces.lastOpenedAt))
						.all();
					const newActiveId = sorted[0]?.id ?? null;
					localDb
						.insert(settings)
						.values({ id: 1, lastActiveWorkspaceId: newActiveId })
						.onConflictDoUpdate({
							target: settings.id,
							set: { lastActiveWorkspaceId: newActiveId },
						})
						.run();
				}

				const terminalWarning =
					terminalResult.failed > 0
						? `${terminalResult.failed} terminal process(es) may still be running`
						: undefined;

				track("workspace_closed", { workspace_id: input.id });

				return { success: true, terminalWarning };
			}),

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
				const workspace = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.id, input.workspaceId))
					.get();

				if (!workspace) {
					throw new Error("Workspace not found");
				}

				const worktree = workspace.worktreeId
					? localDb
							.select()
							.from(worktrees)
							.where(eq(worktrees.id, workspace.worktreeId))
							.get()
					: null;

				if (!worktree) {
					throw new Error("Worktree not found");
				}

				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, workspace.projectId))
					.get();

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
				const workspace = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.id, input.workspaceId))
					.get();

				if (!workspace) {
					return null;
				}

				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, workspace.projectId))
					.get();

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

export type WorkspacesRouter = ReturnType<typeof createWorkspacesRouter>;
