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
	generateBranchName,
	getCurrentBranch,
	listBranches,
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

				// Get existing branches to avoid name collisions
				const { local, remote } = await listBranches(project.mainRepoPath);
				const existingBranches = [...local, ...remote];
				const branch =
					input.branchName?.trim() || generateBranchName(existingBranches);

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

		createCloudWorkspace: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
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

				const maxTabOrder = getMaxWorkspaceTabOrder(input.projectId);
				const workspaceName = input.name?.trim() || "Cloud Workspace";

				const workspace = localDb
					.insert(workspaces)
					.values({
						projectId: input.projectId,
						type: "cloud",
						branch: "cloud",
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
					type: "cloud",
				});

				return {
					workspace,
					projectId: project.id,
				};
			}),
	});
};
