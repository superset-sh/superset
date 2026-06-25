import { basename } from "node:path";
import type { SelectWorktree } from "@superset/local-db";
import { projects, workspaces, worktrees } from "@superset/local-db";
import { and, eq, isNull } from "drizzle-orm";
import { track } from "main/lib/analytics";
import { localDb } from "main/lib/local-db";
import { getDefaultProjectColor } from "../../projects/utils/colors";
import { resolveWorkspaceBaseBranch } from "./base-branch";
import { setBranchBaseConfig } from "./base-branch-config";
import {
	activateProject,
	getBranchWorkspace,
	getMaxProjectChildTabOrder,
	setLastActiveWorkspace,
	touchWorkspace,
	updateActiveWorkspaceIfRemoved,
} from "./db-helpers";
import {
	getDefaultBranch,
	getWorktreeCreatedAt,
	listExternalWorktrees,
} from "./git";
import { resolveLinkedWorktreeGit } from "./resolve-linked-worktree-git";
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
		const compareBaseBranch = resolveWorkspaceBaseBranch({
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

		const activeWorkspaceForExistingWorktree = existingWorktreeByPath
			? localDb
					.select()
					.from(workspaces)
					.where(
						and(
							eq(workspaces.worktreeId, existingWorktreeByPath.id),
							isNull(workspaces.deletingAt),
						),
					)
					.get()
			: undefined;
		if (activeWorkspaceForExistingWorktree) {
			throw new Error("Worktree already has an active workspace");
		}

		const worktreeCreatedAt = getWorktreeCreatedAt(externalMatch.path);
		const worktree = existingWorktreeByPath
			? {
					...existingWorktreeByPath,
					branch,
					baseBranch: compareBaseBranch,
					createdAt: worktreeCreatedAt,
					gitStatus: null,
					githubStatus: null,
					createdBySuperset: false,
				}
			: localDb
					.insert(worktrees)
					.values({
						projectId,
						path: externalMatch.path,
						branch,
						baseBranch: compareBaseBranch,
						createdAt: worktreeCreatedAt,
						gitStatus: null, // Will be populated by refresh pipeline
						createdBySuperset: false, // Mark as external
					})
					.returning()
					.get();

		if (existingWorktreeByPath) {
			localDb
				.update(worktrees)
				.set({
					branch,
					baseBranch: compareBaseBranch,
					createdAt: worktreeCreatedAt,
					gitStatus: null,
					githubStatus: null,
					createdBySuperset: false,
				})
				.where(eq(worktrees.id, existingWorktreeByPath.id))
				.run();
		}

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
			compareBaseBranch,
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
			base_branch: compareBaseBranch,
			source: "external_import_auto",
			host_kind: "local",
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
}: OpenExternalWorktreeParams): Promise<OpenExternalWorktreeResult> {
	const project = localDb
		.select()
		.from(projects)
		.where(eq(projects.id, projectId))
		.get();

	if (!project) {
		throw new Error(`Project ${projectId} not found`);
	}

	const liveWorktrees = await listExternalWorktrees(project.mainRepoPath);
	const liveWorktree = liveWorktrees.find(
		(worktree) => worktree.path === worktreePath,
	);
	if (!liveWorktree) {
		throw new Error("Worktree no longer exists on disk");
	}
	if (liveWorktree.isBare || liveWorktree.isDetached || !liveWorktree.branch) {
		throw new Error("Worktree is not importable");
	}
	const branch = liveWorktree.branch;
	const worktreeCreatedAt = getWorktreeCreatedAt(worktreePath);

	let existingWorktree = localDb
		.select()
		.from(worktrees)
		.where(
			and(eq(worktrees.projectId, projectId), eq(worktrees.path, worktreePath)),
		)
		.get();

	if (existingWorktree) {
		let refreshedBaseBranch: string | undefined;
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

		if (existingWorktree.branch !== branch) {
			if (existingWorkspace) {
				throw new Error(
					"Worktree already has an active workspace on a different branch",
				);
			}

			const knownBranches = await getKnownBranchesSafe(project.mainRepoPath);
			refreshedBaseBranch = resolveWorkspaceBaseBranch({
				workspaceBaseBranch: project.workspaceBaseBranch,
				defaultBranch: project.defaultBranch,
				knownBranches,
			});

			localDb
				.update(worktrees)
				.set({
					branch,
					baseBranch: refreshedBaseBranch,
					createdAt: worktreeCreatedAt,
					gitStatus: {
						branch,
						needsRebase: false,
						ahead: 0,
						behind: 0,
						lastRefreshed: Date.now(),
					},
					githubStatus: null,
					createdBySuperset: false,
				})
				.where(eq(worktrees.id, existingWorktree.id))
				.run();
			existingWorktree = {
				...existingWorktree,
				branch,
				baseBranch: refreshedBaseBranch,
				createdAt: worktreeCreatedAt,
				gitStatus: {
					branch,
					needsRebase: false,
					ahead: 0,
					behind: 0,
					lastRefreshed: Date.now(),
				},
				githubStatus: null,
				createdBySuperset: false,
			};
		}

		if (existingWorktree.createdAt !== worktreeCreatedAt) {
			localDb
				.update(worktrees)
				.set({ createdAt: worktreeCreatedAt })
				.where(eq(worktrees.id, existingWorktree.id))
				.run();
			existingWorktree = {
				...existingWorktree,
				createdAt: worktreeCreatedAt,
			};
		}

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

		if (refreshedBaseBranch !== undefined) {
			await setBranchBaseConfig({
				repoPath: project.mainRepoPath,
				branch: existingWorktree.branch,
				compareBaseBranch: refreshedBaseBranch,
				isExplicit: false,
			});
		}

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
	const compareBaseBranch = resolveWorkspaceBaseBranch({
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
			baseBranch: compareBaseBranch,
			createdAt: worktreeCreatedAt,
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
		base_branch: compareBaseBranch,
		source: "external_import",
		host_kind: "local",
	});

	await setBranchBaseConfig({
		repoPath: project.mainRepoPath,
		branch,
		compareBaseBranch,
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

export interface OpenLinkedWorktreeResult {
	workspaceId: string;
	projectId: string;
}

/**
 * Open a linked worktree whose parent project may not be loaded into superset.
 *
 * Registers the parent project in a loaded-but-hidden state: a brand-new project
 * keeps tabOrder = NULL (excluded from the top-level sidebar list) so the worktree
 * is reachable only through its symlink rows. Writes nothing into the target dir.
 * Idempotent: an already-imported worktree returns its existing workspace.
 */
export async function openLinkedWorktree(
	targetPath: string,
): Promise<OpenLinkedWorktreeResult> {
	const resolved = await resolveLinkedWorktreeGit(targetPath);
	if (!resolved) {
		throw new Error(`Not an importable git worktree: ${targetPath}`);
	}
	const { mainRepoPath, toplevel, branch } = resolved;

	const defaultBranch = await getDefaultBranch(mainRepoPath);

	// Upsert the project WITHOUT activateProject: a new project stays hidden
	// (tabOrder = NULL); an already-loaded project keeps its current tabOrder.
	let project = localDb
		.select()
		.from(projects)
		.where(eq(projects.mainRepoPath, mainRepoPath))
		.get();

	if (project) {
		localDb
			.update(projects)
			.set({ lastOpenedAt: Date.now(), defaultBranch })
			.where(eq(projects.id, project.id))
			.run();
	} else {
		project = localDb
			.insert(projects)
			.values({
				mainRepoPath,
				name: basename(mainRepoPath),
				color: getDefaultProjectColor(),
				defaultBranch,
				// tabOrder intentionally omitted => NULL => hidden from sidebar.
			})
			.returning()
			.get();
	}

	// Case A: the target IS the project's main checkout — use a branch workspace.
	if (toplevel === mainRepoPath) {
		const existingBranch = getBranchWorkspace(project.id);
		if (existingBranch) {
			return { workspaceId: existingBranch.id, projectId: project.id };
		}
		const branchWorkspace = localDb
			.insert(workspaces)
			.values({
				projectId: project.id,
				type: "branch",
				branch,
				name: "default",
				tabOrder: 0,
			})
			.onConflictDoNothing()
			.returning()
			.get();
		const workspaceId =
			branchWorkspace?.id ??
			// onConflictDoNothing hit the unique (projectId WHERE type='branch') index.
			getBranchWorkspace(project.id)?.id;
		if (!workspaceId) {
			// Unreachable in practice unless a branch workspace is mid-soft-delete:
			// the partial unique index ignores deletingAt, so the insert conflicts
			// while getBranchWorkspace (which filters it out) finds nothing. Same
			// pre-existing edge as projects.ts ensureMainWorkspace.
			throw new Error(
				"Failed to create branch workspace for linked main checkout",
			);
		}
		return { workspaceId, projectId: project.id };
	}

	// Case B: the target is a git worktree of the project.
	const existingWorktree = localDb
		.select()
		.from(worktrees)
		.where(
			and(eq(worktrees.projectId, project.id), eq(worktrees.path, toplevel)),
		)
		.get();

	if (existingWorktree) {
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
			return { workspaceId: existingWorkspace.id, projectId: project.id };
		}
	}

	const worktreeRow =
		existingWorktree ??
		localDb
			.insert(worktrees)
			.values({
				projectId: project.id,
				path: toplevel,
				branch,
				baseBranch: defaultBranch,
				createdAt: getWorktreeCreatedAt(toplevel),
				gitStatus: {
					branch,
					needsRebase: false,
					ahead: 0,
					behind: 0,
					lastRefreshed: Date.now(),
				},
				createdBySuperset: false,
			})
			.returning()
			.get();

	const workspace = createWorkspaceFromWorktree({
		projectId: project.id,
		worktreeId: worktreeRow.id,
		branch,
		name: branch,
	});

	return { workspaceId: workspace.id, projectId: project.id };
}
