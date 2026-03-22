import type { SelectWorktree } from "@superset/local-db";
import { projects, workspaces, worktrees } from "@superset/local-db";
import { and, eq, isNull } from "drizzle-orm";
import { track } from "main/lib/analytics";
import { localDb } from "main/lib/local-db";
import { resolveWorkspaceBaseBranch } from "./base-branch";
import { setBranchBaseConfig } from "./base-branch-config";
import {
	activateProject,
	getMaxProjectChildTabOrder,
	setLastActiveWorkspace,
	touchWorkspace,
	updateActiveWorkspaceIfRemoved,
} from "./db-helpers";
import { listExternalWorktrees, worktreeExists } from "./git";
import { resolveWorktreePath } from "./resolve-worktree-path";
import { copySupersetConfigToWorktree, loadSetupConfig } from "./setup";

interface CreateWorkspaceFromWorktreeParams {
	projectId: string;
	worktreeId: string;
	branch: string;
	name: string;
}

export function createWorkspaceFromWorktree({
	projectId,
	worktreeId,
	branch,
	name,
}: CreateWorkspaceFromWorktreeParams) {
	const maxTabOrder = getMaxProjectChildTabOrder(projectId);

	const workspace = localDb
		.insert(workspaces)
		.values({
			projectId,
			worktreeId,
			type: "worktree",
			branch,
			name,
			tabOrder: maxTabOrder + 1,
		})
		.returning()
		.get();

	setLastActiveWorkspace(workspace.id);

	return workspace;
}

async function getKnownBranchesSafe(
	repoPath: string,
): Promise<string[] | undefined> {
	try {
		const { listBranches } = await import("./git");
		const { local, remote } = await listBranches(repoPath);
		return [...local, ...remote];
	} catch (error) {
		console.warn(
			`[workspace-creation] Failed to list branches for ${repoPath}:`,
			error,
		);
		return undefined;
	}
}

export interface CreateWorkspaceFromExternalWorktreeParams {
	projectId: string;
	branch: string;
	name: string;
}

export interface CreateWorkspaceFromExternalWorktreeResult {
	workspace: typeof workspaces.$inferSelect;
	initialCommands: string[] | null;
	worktreePath: string;
	projectId: string;
	isInitializing: false;
	wasExisting: true;
}

/**
 * Attempts to import an external worktree for a given branch and create a workspace.
 * Returns the created workspace if successful, or undefined if no external worktree found.
 *
 * This function:
 * 1. Searches for external worktrees matching the branch
 * 2. Filters out invalid candidates (main repo, bare, detached)
 * 3. Selects the best match (exact path match or single candidate)
 * 4. Imports the worktree into the database with createdBySuperset=false
 * 5. Creates a workspace and configures it
 * 6. Implements transaction rollback on failure
 */
export async function createWorkspaceFromExternalWorktree({
	projectId,
	branch,
	name,
}: CreateWorkspaceFromExternalWorktreeParams): Promise<
	CreateWorkspaceFromExternalWorktreeResult | undefined
> {
	const project = localDb
		.select()
		.from(projects)
		.where(eq(projects.id, projectId))
		.get();

	if (!project) {
		throw new Error(`Project ${projectId} not found`);
	}

	// Check for external worktree (exists on disk but not tracked in DB)
	const externalWorktrees = await listExternalWorktrees(project.mainRepoPath);

	// Filter candidates: exclude main repo, bare, and detached
	const candidates = externalWorktrees.filter(
		(wt) =>
			wt.branch === branch &&
			!wt.isBare &&
			!wt.isDetached &&
			wt.path !== project.mainRepoPath, // Exclude main repo
	);

	// Prefer exact path match if available, otherwise take the only candidate
	const expectedPath = resolveWorktreePath(project, branch);
	const externalMatch =
		candidates.find((wt) => wt.path === expectedPath) ??
		(candidates.length === 1 ? candidates[0] : undefined);

	// Handle ambiguous case
	if (!externalMatch && candidates.length > 1) {
		throw new Error(
			`Multiple external worktrees found for branch "${branch}". Please specify which one to use.`,
		);
	}

	if (!externalMatch) {
		return undefined; // No external worktree found
	}

	console.log(
		`[workspace-creation] Found external worktree for branch "${branch}", importing automatically`,
	);

	// Import the external worktree with transaction rollback on failure
	let worktreeId: string | undefined;
	let workspaceId: string | undefined;
	let existingWorktreeByPath: SelectWorktree | undefined;

	try {
		const knownBranches = await getKnownBranchesSafe(project.mainRepoPath);
		const baseBranch = resolveWorkspaceBaseBranch({
			workspaceBaseBranch: project.workspaceBaseBranch,
			defaultBranch: project.defaultBranch,
			knownBranches,
		});

		// Check for existing worktree by path to prevent duplicates
		existingWorktreeByPath = localDb
			.select()
			.from(worktrees)
			.where(
				and(
					eq(worktrees.projectId, projectId),
					eq(worktrees.path, externalMatch.path),
				),
			)
			.get();

		const worktree =
			existingWorktreeByPath ??
			localDb
				.insert(worktrees)
				.values({
					projectId,
					path: externalMatch.path,
					branch,
					baseBranch,
					gitStatus: null, // Will be populated by refresh pipeline
					createdBySuperset: false, // Mark as external
				})
				.returning()
				.get();

		worktreeId = worktree.id;

		const workspace = createWorkspaceFromWorktree({
			projectId,
			worktreeId: worktree.id,
			branch,
			name,
		});

		workspaceId = workspace.id;

		activateProject(project);

		copySupersetConfigToWorktree(project.mainRepoPath, externalMatch.path);

		await setBranchBaseConfig({
			repoPath: project.mainRepoPath,
			branch,
			baseBranch,
			isExplicit: false,
		});

		const setupConfig = loadSetupConfig({
			mainRepoPath: project.mainRepoPath,
			worktreePath: externalMatch.path,
			projectId: project.id,
		});

		track("workspace_created", {
			workspace_id: workspace.id,
			project_id: project.id,
			branch,
			base_branch: baseBranch,
			source: "external_import_auto",
		});

		return {
			workspace,
			initialCommands: setupConfig?.setup || null,
			worktreePath: externalMatch.path,
			projectId: project.id,
			isInitializing: false,
			wasExisting: true,
		};
	} catch (error) {
		// Rollback: Clean up DB records if side effects failed
		if (workspaceId) {
			try {
				localDb.delete(workspaces).where(eq(workspaces.id, workspaceId)).run();
				updateActiveWorkspaceIfRemoved(workspaceId);
			} catch (cleanupError) {
				console.error(
					"[workspace-creation] Failed to clean up workspace record:",
					cleanupError,
				);
			}
		}
		if (
			worktreeId &&
			!existingWorktreeByPath // Only delete if we created it
		) {
			try {
				localDb.delete(worktrees).where(eq(worktrees.id, worktreeId)).run();
			} catch (cleanupError) {
				console.error(
					"[workspace-creation] Failed to clean up worktree record:",
					cleanupError,
				);
			}
		}
		throw error;
	}
}

export interface OpenExternalWorktreeParams {
	projectId: string;
	worktreePath: string;
	branch: string;
}

export interface OpenExternalWorktreeResult {
	workspace: typeof workspaces.$inferSelect;
	initialCommands: string[] | null;
	worktreePath: string;
	projectId: string;
	wasExisting: boolean;
}

/**
 * Opens an external worktree by importing it into the database.
 * If the worktree is already imported, returns the existing workspace or creates a new one.
 */
export async function openExternalWorktree({
	projectId,
	worktreePath,
	branch,
}: OpenExternalWorktreeParams): Promise<OpenExternalWorktreeResult> {
	const project = localDb
		.select()
		.from(projects)
		.where(eq(projects.id, projectId))
		.get();

	if (!project) {
		throw new Error(`Project ${projectId} not found`);
	}

	const exists = await worktreeExists(project.mainRepoPath, worktreePath);
	if (!exists) {
		throw new Error("Worktree no longer exists on disk");
	}

	const existingWorktree = localDb
		.select()
		.from(worktrees)
		.where(
			and(eq(worktrees.projectId, projectId), eq(worktrees.path, worktreePath)),
		)
		.get();

	if (existingWorktree) {
		// Failed init can leave gitStatus null, which shows "Setup incomplete" UI
		if (!existingWorktree.gitStatus) {
			localDb
				.update(worktrees)
				.set({
					gitStatus: {
						branch: existingWorktree.branch,
						needsRebase: false,
						ahead: 0,
						behind: 0,
						lastRefreshed: Date.now(),
					},
				})
				.where(eq(worktrees.id, existingWorktree.id))
				.run();
		}

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
			touchWorkspace(existingWorkspace.id);
			setLastActiveWorkspace(existingWorkspace.id);
			return {
				workspace: existingWorkspace,
				initialCommands: null,
				worktreePath: existingWorktree.path,
				projectId: project.id,
				wasExisting: true,
			};
		}

		const maxTabOrder = getMaxProjectChildTabOrder(projectId);
		const workspace = localDb
			.insert(workspaces)
			.values({
				projectId,
				worktreeId: existingWorktree.id,
				type: "worktree",
				branch: existingWorktree.branch,
				name: existingWorktree.branch,
				tabOrder: maxTabOrder + 1,
			})
			.returning()
			.get();

		setLastActiveWorkspace(workspace.id);
		activateProject(project);

		copySupersetConfigToWorktree(project.mainRepoPath, existingWorktree.path);
		const setupConfig = loadSetupConfig({
			mainRepoPath: project.mainRepoPath,
			worktreePath: existingWorktree.path,
			projectId: project.id,
		});

		track("workspace_opened", {
			workspace_id: workspace.id,
			project_id: project.id,
			type: "worktree",
			source: "external_import",
		});

		return {
			workspace,
			initialCommands: setupConfig?.setup || null,
			worktreePath: existingWorktree.path,
			projectId: project.id,
			wasExisting: false,
		};
	}

	const knownBranches = await getKnownBranchesSafe(project.mainRepoPath);
	const baseBranch = resolveWorkspaceBaseBranch({
		workspaceBaseBranch: project.workspaceBaseBranch,
		defaultBranch: project.defaultBranch,
		knownBranches,
	});

	const worktree = localDb
		.insert(worktrees)
		.values({
			projectId,
			path: worktreePath,
			branch,
			baseBranch,
			gitStatus: {
				branch,
				needsRebase: false,
				ahead: 0,
				behind: 0,
				lastRefreshed: Date.now(),
			},
			createdBySuperset: false, // External worktree
		})
		.returning()
		.get();

	const maxTabOrder = getMaxProjectChildTabOrder(projectId);
	const workspace = localDb
		.insert(workspaces)
		.values({
			projectId,
			worktreeId: worktree.id,
			type: "worktree",
			branch,
			name: branch,
			tabOrder: maxTabOrder + 1,
		})
		.returning()
		.get();

	setLastActiveWorkspace(workspace.id);
	activateProject(project);

	copySupersetConfigToWorktree(project.mainRepoPath, worktreePath);
	const setupConfig = loadSetupConfig({
		mainRepoPath: project.mainRepoPath,
		worktreePath,
		projectId: project.id,
	});

	track("workspace_created", {
		workspace_id: workspace.id,
		project_id: project.id,
		branch,
		base_branch: baseBranch,
		source: "external_import",
	});

	await setBranchBaseConfig({
		repoPath: project.mainRepoPath,
		branch,
		baseBranch,
		isExplicit: false,
	});

	return {
		workspace,
		initialCommands: setupConfig?.setup || null,
		worktreePath,
		projectId: project.id,
		wasExisting: false,
	};
}
