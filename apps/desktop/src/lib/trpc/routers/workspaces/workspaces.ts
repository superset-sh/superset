import { join } from "node:path";
import { db } from "main/lib/db";
import { terminalManager } from "main/lib/terminal-manager";
import { nanoid } from "nanoid";
import simpleGit from "simple-git";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	createWorktree,
	generateBranchName,
	removeWorktree,
} from "./utils/git";
import { findAdjacentWorkspace } from "./utils";

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

				const worktreePath = join(project.mainRepoPath, ".superset", branch);

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
					activeTabId: undefined,
					isActive: true,
					createdAt: Date.now(),
					updatedAt: Date.now(),
					lastOpenedAt: Date.now(),
				};

				await db.update((data) => {
					for (const ws of data.workspaces) {
						ws.isActive = false;
					}

					data.worktrees.push(worktree);
					data.workspaces.push(workspace);

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

				return workspace;
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

		getActive: publicProcedure.query(() => {
			const workspace = db.data.workspaces.find((w) => w.isActive);
			return workspace || null;
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

				// Try to remove worktree, but continue with cleanup even if it fails
				let worktreeWarning: string | null = null;
				if (worktree && project) {
					try {
						await removeWorktree(project.mainRepoPath, worktree.path);
					} catch (error) {
						const errorMessage =
							error instanceof Error ? error.message : String(error);
						console.error("Failed to remove worktree:", errorMessage);
						worktreeWarning = `Workspace deleted from app, but couldn't remove git worktree at ${worktree.path}. You may need to manually clean it up if it still exists.`;
					}
				}

				const deletedTabIds = db.data.tabs
					.filter((t) => t.workspaceId === input.id)
					.map((t) => t.id);

				// Find adjacent workspace to activate (before deletion) if necessary
				const adjacentWorkspace = workspace.isActive
					? findAdjacentWorkspace(
							db.data.projects,
							db.data.workspaces,
							input.id,
						)
					: undefined;

				await db.update((data) => {
					data.tabs = data.tabs.filter((t) => t.workspaceId !== input.id);
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

					// Activate adjacent workspace if one was found
					if (adjacentWorkspace) {
						const ws = data.workspaces.find(
							(w) => w.id === adjacentWorkspace.id,
						);
						if (ws) {
							ws.isActive = true;
						}
					}
				});

				for (const tabId of deletedTabIds) {
					terminalManager.kill({ tabId });
				}

				return {
					success: true,
					warning: worktreeWarning,
				};
			}),

		setActive: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				await db.update((data) => {
					// Deactivate all workspaces
					for (const ws of data.workspaces) {
						ws.isActive = false;
					}

					// Activate target workspace
					const workspace = data.workspaces.find((w) => w.id === input.id);
					if (!workspace) {
						throw new Error(`Workspace ${input.id} not found`);
					}

					workspace.isActive = true;
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
