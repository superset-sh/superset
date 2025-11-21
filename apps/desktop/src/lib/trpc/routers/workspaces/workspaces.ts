import { z } from "zod";
import { nanoid } from "nanoid";
import { join } from "node:path";
import { publicProcedure, router } from "../..";
import { db } from "../../../../main/lib/db";
import {
	generateBranchName,
	createWorktree,
	removeWorktree,
} from "./utils/git";

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
				// Find the project
				const project = db.data.projects.find((p) => p.id === input.projectId);
				if (!project) {
					throw new Error(`Project ${input.projectId} not found`);
				}

				const branch = generateBranchName();

				const worktreePath = join(
					project.mainRepoPath,
					".superset",
					branch,
				);

				// Create git worktree
				await createWorktree(project.mainRepoPath, branch, worktreePath);

				// Create worktree record
				const worktree = {
					id: nanoid(),
					projectId: input.projectId,
					path: worktreePath,
					branch,
					createdAt: Date.now(),
				};

				// Set order to be at the end of the list
				const maxOrder =
					db.data.workspaces.length > 0
						? Math.max(...db.data.workspaces.map((w) => w.order))
						: -1;

				const workspace = {
					id: nanoid(),
					projectId: input.projectId,
					worktreeId: worktree.id,
					name: input.name ?? branch,
					order: maxOrder + 1,
					createdAt: Date.now(),
					updatedAt: Date.now(),
					lastOpenedAt: Date.now(),
				};

				// Save to database
				await db.update((data) => {
					data.worktrees.push(worktree);
					data.workspaces.push(workspace);
					data.settings.lastActiveWorkspaceId = workspace.id;

					// Update project lastOpenedAt
					const p = data.projects.find((p) => p.id === input.projectId);
					if (p) {
						p.lastOpenedAt = Date.now();
					}
				});

				return workspace;
			}),

		/**
		 * Get a workspace by ID
		 * Throws if workspace not found
		 */
		get: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }) => {
				const workspace = db.data.workspaces.find((w) => w.id === input.id);
				if (!workspace) {
					throw new Error(`Workspace ${input.id} not found`);
				}
				return workspace;
			}),

		/**
		 * Get all workspaces sorted by order
		 */
		getAll: publicProcedure.query(() => {
			return db.data.workspaces
				.slice()
				.sort((a, b) => a.order - b.order);
		}),

		/**
		 * Get the last active workspace
		 * Returns null if no active workspace set (valid state)
		 * Throws if active workspace ID exists but workspace not found (data inconsistency)
		 */
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

		/**
		 * Update a workspace
		 * Supports partial updates to workspace properties
		 */
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

					// Apply patches
					if (input.patch.name !== undefined) {
						workspace.name = input.patch.name;
					}

					// Update timestamps
					workspace.updatedAt = Date.now();
					workspace.lastOpenedAt = Date.now();
				});

				return { success: true };
			}),

		/**
		 * Delete a workspace and its associated worktree
		 */
		delete: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				const workspace = db.data.workspaces.find((w) => w.id === input.id);

				if (!workspace) {
					return { success: false, error: "Workspace not found" };
				}

				// Find associated worktree and project
				const worktree = db.data.worktrees.find(
					(wt) => wt.id === workspace.worktreeId,
				);
				const project = db.data.projects.find(
					(p) => p.id === workspace.projectId,
				);

				// Remove git worktree if it exists
				if (worktree && project) {
					try {
						await removeWorktree(project.mainRepoPath, worktree.path);
					} catch (error) {
						console.error("Failed to remove worktree:", error);
						// Continue with database cleanup even if git operation fails
					}
				}

				// Remove from database
				await db.update((data) => {
					// Remove workspace
					data.workspaces = data.workspaces.filter((w) => w.id !== input.id);

					// Remove worktree
					if (worktree) {
						data.worktrees = data.worktrees.filter(
							(wt) => wt.id !== worktree.id,
						);
					}

					// Update last active workspace if needed
					if (data.settings.lastActiveWorkspaceId === input.id) {
						// Set to the most recently opened workspace, if any
						const sorted = data.workspaces
							.slice()
							.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
						data.settings.lastActiveWorkspaceId = sorted[0]?.id || undefined;
					}
				});

				return { success: true };
			}),

		/**
		 * Set active workspace
		 */
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

		/**
		 * Reorder workspaces
		 */
		reorder: publicProcedure
			.input(
				z.object({
					fromIndex: z.number(),
					toIndex: z.number(),
				}),
			)
			.mutation(async ({ input }) => {
				await db.update((data) => {
					const { fromIndex, toIndex } = input;

					// Get all workspaces sorted by order
					const workspaces = data.workspaces
						.slice()
						.sort((a, b) => a.order - b.order);

					// Move workspace from fromIndex to toIndex
					const [removed] = workspaces.splice(fromIndex, 1);
					workspaces.splice(toIndex, 0, removed);

					// Update order fields to reflect new positions
					workspaces.forEach((workspace, index) => {
						const ws = data.workspaces.find((w) => w.id === workspace.id);
						if (ws) {
							ws.order = index;
						}
					});
				});

				return { success: true };
			}),
	});
};

export type WorkspacesRouter = ReturnType<typeof createWorkspacesRouter>;
