import { homedir } from "node:os";
import { join } from "node:path";
import { db } from "main/lib/db";
import { nanoid } from "nanoid";
import { SUPERSET_DIR_NAME, WORKTREES_DIR_NAME } from "shared/constants";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	createWorktree,
	generateBranchName,
	removeWorktree,
	worktreeExists,
} from "./utils/git";
import { copySetupFiles, loadSetupConfig } from "./utils/setup";
import { getWorktreePath } from "./utils/worktree";

export const createWorkspacesRouter = () => {
	return router({
		create: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					name: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const project = db.data.projects.find((p) => p.id === input.projectId);
				if (!project) {
					throw new Error(`Project ${input.projectId} not found`);
				}

				const branch = generateBranchName();

				const worktreePath = join(
					homedir(),
					SUPERSET_DIR_NAME,
					WORKTREES_DIR_NAME,
					branch,
				);

				await createWorktree(project.mainRepoPath, branch, worktreePath);

				const worktree = {
					id: nanoid(),
					projectId: input.projectId,
					path: worktreePath,
					branch,
					createdAt: Date.now(),
				};

				const projectWorkspaces = db.data.workspaces.filter(
					(w) => w.projectId === input.projectId,
				);
				const maxTabOrder =
					projectWorkspaces.length > 0
						? Math.max(...projectWorkspaces.map((w) => w.tabOrder))
						: -1;

				const workspace = {
					id: nanoid(),
					projectId: input.projectId,
					worktreeId: worktree.id,
					name: input.name ?? branch,
					tabOrder: maxTabOrder + 1,
					createdAt: Date.now(),
					updatedAt: Date.now(),
					lastOpenedAt: Date.now(),
				};

				await db.update((data) => {
					data.worktrees.push(worktree);
					data.workspaces.push(workspace);
					data.settings.lastActiveWorkspaceId = workspace.id;

					const p = data.projects.find((p) => p.id === input.projectId);
					if (p) {
						p.lastOpenedAt = Date.now();

						if (p.tabOrder === null) {
							const activeProjects = data.projects.filter(
								(proj) => proj.tabOrder !== null,
							);
							const maxProjectTabOrder =
								activeProjects.length > 0
									? Math.max(...activeProjects.map((proj) => proj.tabOrder!))
									: -1;
							p.tabOrder = maxProjectTabOrder + 1;
						}
					}
				});

				// Load setup configuration
				const setupConfig = loadSetupConfig(project.mainRepoPath);
				let setupCopyResults: { copied: string[]; errors: string[] } | null =
					null;

				// Copy setup files if config exists and has copy patterns
				if (setupConfig?.copy && setupConfig.copy.length > 0) {
					try {
						setupCopyResults = await copySetupFiles(
							project.mainRepoPath,
							worktreePath,
							setupConfig.copy,
						);
					} catch (error) {
						console.error("Failed to copy setup files:", error);
						// Non-fatal: return error info but continue
						setupCopyResults = {
							copied: [],
							errors: [
								`Setup file copy failed: ${error instanceof Error ? error.message : String(error)}`,
							],
						};
					}
				}

				return {
					workspace,
					setupConfig: setupConfig?.commands || null,
					setupCopyResults,
					worktreePath,
				};
			}),

		get: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }) => {
				const workspace = db.data.workspaces.find((w) => w.id === input.id);
				if (!workspace) {
					throw new Error(`Workspace ${input.id} not found`);
				}
				return workspace;
			}),

		getAll: publicProcedure.query(() => {
			return db.data.workspaces.slice().sort((a, b) => a.tabOrder - b.tabOrder);
		}),

		getAllGrouped: publicProcedure.query(() => {
			const activeProjects = db.data.projects.filter(
				(p) => p.tabOrder !== null,
			);

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
						worktreeId: string;
						worktreePath: string;
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
						tabOrder: project.tabOrder!,
					},
					workspaces: [],
				});
			}

			const workspaces = db.data.workspaces
				.slice()
				.sort((a, b) => a.tabOrder - b.tabOrder);

			for (const workspace of workspaces) {
				if (groupsMap.has(workspace.projectId)) {
					groupsMap.get(workspace.projectId)?.workspaces.push({
						...workspace,
						worktreePath: getWorktreePath(workspace.worktreeId) ?? "",
					});
				}
			}

			return Array.from(groupsMap.values()).sort(
				(a, b) => a.project.tabOrder - b.project.tabOrder,
			);
		}),

		getActive: publicProcedure.query(() => {
			const { lastActiveWorkspaceId } = db.data.settings;

			if (!lastActiveWorkspaceId) {
				return null;
			}

			const workspace = db.data.workspaces.find(
				(w) => w.id === lastActiveWorkspaceId,
			);
			if (!workspace) {
				throw new Error(
					`Active workspace ${lastActiveWorkspaceId} not found in database`,
				);
			}

			return workspace;
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
			.mutation(async ({ input }) => {
				await db.update((data) => {
					const workspace = data.workspaces.find((w) => w.id === input.id);
					if (!workspace) {
						throw new Error(`Workspace ${input.id} not found`);
					}

					if (input.patch.name !== undefined) {
						workspace.name = input.patch.name;
					}

					workspace.updatedAt = Date.now();
					workspace.lastOpenedAt = Date.now();
				});

				return { success: true };
			}),

		canDelete: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(async ({ input }) => {
				const workspace = db.data.workspaces.find((w) => w.id === input.id);

				if (!workspace) {
					return {
						canDelete: false,
						reason: "Workspace not found",
						workspace: null,
					};
				}

				const worktree = db.data.worktrees.find(
					(wt) => wt.id === workspace.worktreeId,
				);
				const project = db.data.projects.find(
					(p) => p.id === workspace.projectId,
				);

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
							};
						}

						return {
							canDelete: true,
							reason: null,
							workspace,
							warning: null,
						};
					} catch (error) {
						return {
							canDelete: false,
							reason: `Failed to check worktree status: ${error instanceof Error ? error.message : String(error)}`,
							workspace,
						};
					}
				}

				return {
					canDelete: true,
					reason: null,
					workspace,
					warning: "No associated worktree found",
				};
			}),

		delete: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				const workspace = db.data.workspaces.find((w) => w.id === input.id);

				if (!workspace) {
					return { success: false, error: "Workspace not found" };
				}

				const worktree = db.data.worktrees.find(
					(wt) => wt.id === workspace.worktreeId,
				);
				const project = db.data.projects.find(
					(p) => p.id === workspace.projectId,
				);

				if (worktree && project) {
					try {
						const exists = await worktreeExists(
							project.mainRepoPath,
							worktree.path,
						);

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
				}

				// Only proceed with DB cleanup if worktree was successfully removed (or doesn't exist)
				await db.update((data) => {
					data.workspaces = data.workspaces.filter((w) => w.id !== input.id);

					if (worktree) {
						data.worktrees = data.worktrees.filter(
							(wt) => wt.id !== worktree.id,
						);
					}

					if (project) {
						const remainingWorkspaces = data.workspaces.filter(
							(w) => w.projectId === workspace.projectId,
						);
						if (remainingWorkspaces.length === 0) {
							const p = data.projects.find((p) => p.id === workspace.projectId);
							if (p) {
								p.tabOrder = null;
							}
						}
					}

					if (data.settings.lastActiveWorkspaceId === input.id) {
						const sorted = data.workspaces
							.slice()
							.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
						data.settings.lastActiveWorkspaceId = sorted[0]?.id || undefined;
					}
				});

				return { success: true };
			}),

		setActive: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				await db.update((data) => {
					const workspace = data.workspaces.find((w) => w.id === input.id);
					if (!workspace) {
						throw new Error(`Workspace ${input.id} not found`);
					}

					data.settings.lastActiveWorkspaceId = input.id;
					workspace.lastOpenedAt = Date.now();
					workspace.updatedAt = Date.now();
				});

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
			.mutation(async ({ input }) => {
				await db.update((data) => {
					const { projectId, fromIndex, toIndex } = input;

					const projectWorkspaces = data.workspaces
						.filter((w) => w.projectId === projectId)
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

					projectWorkspaces.forEach((workspace, index) => {
						const ws = data.workspaces.find((w) => w.id === workspace.id);
						if (ws) {
							ws.tabOrder = index;
						}
					});
				});

				return { success: true };
			}),
	});
};

export type WorkspacesRouter = ReturnType<typeof createWorkspacesRouter>;
