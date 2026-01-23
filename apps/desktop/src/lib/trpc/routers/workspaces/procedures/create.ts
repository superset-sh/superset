import { homedir } from "node:os";
import { join } from "node:path";
import { projects, workspaces, worktrees } from "@superset/local-db";
import { and, eq, isNull, not } from "drizzle-orm";
import { track } from "main/lib/analytics";
import { localDb } from "main/lib/local-db";
import { workspaceInitManager } from "main/lib/workspace-init-manager";
import { SUPERSET_DIR_NAME, WORKTREES_DIR_NAME } from "shared/constants";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import {
	activateProject,
	getBranchWorkspace,
	getMaxWorkspaceTabOrder,
	getProject,
	getWorktree,
	setLastActiveWorkspace,
	touchWorkspace,
} from "../utils/db-helpers";
import {
	createWorktreeFromPr,
	fetchPrBranch,
	generateBranchName,
	getBranchWorktreePath,
	getCurrentBranch,
	getPrInfo,
	listBranches,
	parsePrUrl,
	safeCheckoutBranch,
	worktreeExists,
} from "../utils/git";
import { loadSetupConfig } from "../utils/setup";
import { initializeWorkspaceWorktree } from "../utils/workspace-init";

export const createCreateProcedures = () => {
	return router({
		create: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					name: z.string().optional(),
					branchName: z.string().optional(),
					baseBranch: z.string().optional(),
					/** If true, use an existing branch instead of creating a new one */
					useExistingBranch: z.boolean().optional(),
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

				// Validation for existing branch mode
				let existingBranchName: string | undefined;
				if (input.useExistingBranch) {
					existingBranchName = input.branchName?.trim();
					if (!existingBranchName) {
						throw new Error(
							"Branch name is required when using an existing branch",
						);
					}

					const existingWorktreePath = await getBranchWorktreePath({
						mainRepoPath: project.mainRepoPath,
						branch: existingBranchName,
					});
					if (existingWorktreePath) {
						throw new Error(
							`Branch "${existingBranchName}" is already checked out in another worktree at: ${existingWorktreePath}`,
						);
					}
				}

				const { local, remote } = await listBranches(project.mainRepoPath);
				const existingBranches = [...local, ...remote];

				let branch: string;
				if (existingBranchName) {
					if (!existingBranches.includes(existingBranchName)) {
						throw new Error(
							`Branch "${existingBranchName}" does not exist. Please select an existing branch.`,
						);
					}
					branch = existingBranchName;
				} else {
					branch =
						input.branchName?.trim() || generateBranchName(existingBranches);
				}

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

				const maxTabOrder = getMaxWorkspaceTabOrder(input.projectId);

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

				setLastActiveWorkspace(workspace.id);
				activateProject(project);

				// Track workspace creation (not initialization - that's tracked when it completes)
				track("workspace_created", {
					workspace_id: workspace.id,
					project_id: project.id,
					branch: branch,
					base_branch: targetBranch,
					use_existing_branch: input.useExistingBranch ?? false,
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
					useExistingBranch: input.useExistingBranch,
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
					branch: z.string().optional(),
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

				const branch =
					input.branch || (await getCurrentBranch(project.mainRepoPath));
				if (!branch) {
					throw new Error("Could not determine current branch");
				}

				// If a specific branch was requested, check for conflict before checkout
				if (input.branch) {
					const existingBranchWorkspace = getBranchWorkspace(input.projectId);
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

				const existing = getBranchWorkspace(input.projectId);

				if (existing) {
					touchWorkspace(existing.id);
					setLastActiveWorkspace(existing.id);
					return {
						workspace: { ...existing, lastOpenedAt: Date.now() },
						worktreePath: project.mainRepoPath,
						projectId: project.id,
						wasExisting: true,
					};
				}

				// Insert new workspace first with conflict handling for race conditions
				// The unique partial index (projectId WHERE type='branch') prevents duplicates
				// We insert first, then shift - this prevents race conditions where
				// concurrent calls both shift before either inserts (causing double shifts)
				const insertResult = localDb
					.insert(workspaces)
					.values({
						projectId: input.projectId,
						type: "branch",
						branch,
						name: branch,
						tabOrder: 0,
					})
					.onConflictDoNothing()
					.returning()
					.all();

				const wasExisting = insertResult.length === 0;

				// Only shift existing workspaces if we successfully inserted
				// Losers of the race should NOT shift (they didn't create anything)
				if (!wasExisting) {
					const newWorkspaceId = insertResult[0].id;
					const projectWorkspaces = localDb
						.select()
						.from(workspaces)
						.where(
							and(
								eq(workspaces.projectId, input.projectId),
								// Exclude the workspace we just inserted
								not(eq(workspaces.id, newWorkspaceId)),
								isNull(workspaces.deletingAt),
							),
						)
						.all();
					for (const ws of projectWorkspaces) {
						localDb
							.update(workspaces)
							.set({ tabOrder: ws.tabOrder + 1 })
							.where(eq(workspaces.id, ws.id))
							.run();
					}
				}

				// If insert returned nothing, another concurrent call won the race
				// Fetch the existing workspace instead
				const workspace =
					insertResult[0] ?? getBranchWorkspace(input.projectId);

				if (!workspace) {
					throw new Error("Failed to create or find branch workspace");
				}

				setLastActiveWorkspace(workspace.id);

				// Update project (only if we actually inserted a new workspace)
				if (!wasExisting) {
					activateProject(project);

					track("workspace_opened", {
						workspace_id: workspace.id,
						project_id: project.id,
						type: "branch",
						was_existing: false,
					});
				}

				return {
					workspace,
					worktreePath: project.mainRepoPath,
					projectId: project.id,
					wasExisting,
				};
			}),

		openWorktree: publicProcedure
			.input(
				z.object({
					worktreeId: z.string(),
					name: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const worktree = getWorktree(input.worktreeId);
				if (!worktree) {
					throw new Error(`Worktree ${input.worktreeId} not found`);
				}

				const existingWorkspace = localDb
					.select()
					.from(workspaces)
					.where(
						and(
							eq(workspaces.worktreeId, input.worktreeId),
							isNull(workspaces.deletingAt),
						),
					)
					.get();
				if (existingWorkspace) {
					throw new Error("Worktree already has an active workspace");
				}

				const project = getProject(worktree.projectId);
				if (!project) {
					throw new Error(`Project ${worktree.projectId} not found`);
				}

				const exists = await worktreeExists(
					project.mainRepoPath,
					worktree.path,
				);
				if (!exists) {
					throw new Error("Worktree no longer exists on disk");
				}

				const maxTabOrder = getMaxWorkspaceTabOrder(worktree.projectId);

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

				setLastActiveWorkspace(workspace.id);
				activateProject(project);

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

		createFromPr: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					prUrl: z.string(),
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

				// Parse the PR URL
				const parsed = parsePrUrl(input.prUrl);
				if (!parsed) {
					throw new Error(
						"Invalid PR URL. Expected format: https://github.com/owner/repo/pull/123",
					);
				}

				// Get PR info from GitHub
				const prInfo = await getPrInfo({
					repoPath: project.mainRepoPath,
					prNumber: parsed.number,
				});

				// Determine the local branch name
				let localBranchName: string;
				if (prInfo.isCrossRepository) {
					// For fork PRs, prefix with the fork owner to avoid conflicts
					const forkOwner = prInfo.headRepositoryOwner.login.toLowerCase();
					localBranchName = `${forkOwner}/${prInfo.headRefName}`;
				} else {
					localBranchName = prInfo.headRefName;
				}

				// Check if we already have a worktree for this branch in our database
				const existingWorktree = localDb
					.select()
					.from(worktrees)
					.where(
						and(
							eq(worktrees.projectId, input.projectId),
							eq(worktrees.branch, localBranchName),
						),
					)
					.get();

				if (existingWorktree) {
					// Check if there's already an active workspace for this worktree
					const existingWorkspace = localDb
						.select()
						.from(workspaces)
						.where(
							and(
								eq(workspaces.worktreeId, existingWorktree.id),
								isNull(workspaces.deletingAt),
							),
						)
						.get();

					if (existingWorkspace) {
						// Workspace already open - just activate it
						touchWorkspace(existingWorkspace.id);
						setLastActiveWorkspace(existingWorkspace.id);

						return {
							workspace: existingWorkspace,
							initialCommands: null,
							worktreePath: existingWorktree.path,
							projectId: project.id,
							prNumber: prInfo.number,
							prTitle: prInfo.title,
							wasExisting: true,
						};
					}

					// Worktree exists but no active workspace - reopen it
					const maxTabOrder = getMaxWorkspaceTabOrder(input.projectId);
					const workspaceName = prInfo.title || `PR #${prInfo.number}`;

					const workspace = localDb
						.insert(workspaces)
						.values({
							projectId: input.projectId,
							worktreeId: existingWorktree.id,
							type: "worktree",
							branch: localBranchName,
							name: workspaceName,
							tabOrder: maxTabOrder + 1,
						})
						.returning()
						.get();

					setLastActiveWorkspace(workspace.id);
					activateProject(project);

					track("workspace_opened", {
						workspace_id: workspace.id,
						project_id: project.id,
						type: "worktree",
						source: "pr",
						pr_number: prInfo.number,
					});

					const setupConfig = loadSetupConfig(project.mainRepoPath);

					return {
						workspace,
						initialCommands: setupConfig?.setup || null,
						worktreePath: existingWorktree.path,
						projectId: project.id,
						prNumber: prInfo.number,
						prTitle: prInfo.title,
						wasExisting: true,
					};
				}

				// No existing worktree - check if the branch is checked out elsewhere on disk
				const existingWorktreePath = await getBranchWorktreePath({
					mainRepoPath: project.mainRepoPath,
					branch: localBranchName,
				});
				if (existingWorktreePath) {
					throw new Error(
						`This PR's branch is already checked out in a worktree at: ${existingWorktreePath}`,
					);
				}

				// Fetch the PR branch (handles forks)
				await fetchPrBranch({
					repoPath: project.mainRepoPath,
					prInfo,
				});

				const worktreePath = join(
					homedir(),
					SUPERSET_DIR_NAME,
					WORKTREES_DIR_NAME,
					project.name,
					localBranchName,
				);

				// Create the worktree
				await createWorktreeFromPr({
					mainRepoPath: project.mainRepoPath,
					worktreePath,
					prInfo,
					localBranchName,
				});

				// Get default branch for base branch reference
				const defaultBranch = project.defaultBranch || "main";

				// Insert worktree record
				const worktree = localDb
					.insert(worktrees)
					.values({
						projectId: input.projectId,
						path: worktreePath,
						branch: localBranchName,
						baseBranch: defaultBranch,
						gitStatus: null,
					})
					.returning()
					.get();

				const maxTabOrder = getMaxWorkspaceTabOrder(input.projectId);

				// Use PR title as workspace name
				const workspaceName = prInfo.title || `PR #${prInfo.number}`;

				const workspace = localDb
					.insert(workspaces)
					.values({
						projectId: input.projectId,
						worktreeId: worktree.id,
						type: "worktree",
						branch: localBranchName,
						name: workspaceName,
						tabOrder: maxTabOrder + 1,
					})
					.returning()
					.get();

				setLastActiveWorkspace(workspace.id);
				activateProject(project);

				track("workspace_created", {
					workspace_id: workspace.id,
					project_id: project.id,
					branch: localBranchName,
					source: "pr",
					pr_number: prInfo.number,
					is_fork: prInfo.isCrossRepository,
				});

				// Start workspace initialization (same as regular create flow)
				workspaceInitManager.startJob(workspace.id, input.projectId);

				// Initialize workspace in background (worktree already created, just need setup)
				initializeWorkspaceWorktree({
					workspaceId: workspace.id,
					projectId: input.projectId,
					worktreeId: worktree.id,
					worktreePath,
					branch: localBranchName,
					baseBranch: defaultBranch,
					baseBranchWasExplicit: false,
					mainRepoPath: project.mainRepoPath,
					useExistingBranch: true, // PR branch already exists
					skipWorktreeCreation: true, // Worktree already created by createWorktreeFromPr
				});

				const setupConfig = loadSetupConfig(project.mainRepoPath);

				return {
					workspace,
					initialCommands: setupConfig?.setup || null,
					worktreePath,
					projectId: project.id,
					prNumber: prInfo.number,
					prTitle: prInfo.title,
					wasExisting: false,
				};
			}),
	});
};
