import { z } from "zod";
import { nanoid } from "nanoid";
import { publicProcedure, router } from "../..";
import { db } from "../../../../main/lib/db";

/**
 * Workspaces router
 * Handles workspace CRUD operations
 */
export const createWorkspacesRouter = () => {
	return router({
		/**
		 * Create a new workspace
		 */
		create: publicProcedure
			.input(
				z.object({
					name: z.string(),
					path: z.string().nullable().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				// Set order to be at the end of the list
				const maxOrder = db.data.workspaces.length > 0
					? Math.max(...db.data.workspaces.map((w) => w.order))
					: -1;

				const workspace = {
					id: nanoid(),
					name: input.name,
					path: input.path ?? null,
					order: maxOrder + 1,
					createdAt: Date.now(),
					updatedAt: Date.now(),
					lastOpenedAt: Date.now(),
				};

				await db.update((data) => {
					data.workspaces.push(workspace);
					data.settings.lastActiveWorkspaceId = workspace.id;
				});

				return workspace;
			}),

		/**
		 * Get a workspace by ID
		 */
		get: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }) => {
				const workspace = db.data.workspaces.find((w) => w.id === input.id);
				return workspace || null;
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
		 */
		getActive: publicProcedure.query(() => {
			const { lastActiveWorkspaceId } = db.data.settings;

			if (!lastActiveWorkspaceId) {
				return null;
			}

			return db.data.workspaces.find((w) => w.id === lastActiveWorkspaceId) || null;
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
						path: z.string().nullable().optional(),
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
					if (input.patch.path !== undefined) {
						workspace.path = input.patch.path;
					}

					// Update timestamps
					workspace.updatedAt = Date.now();
					workspace.lastOpenedAt = Date.now();
				});

				return { success: true };
			}),

		/**
		 * Delete a workspace
		 * Also removes from recents if no other workspace uses that path
		 */
		delete: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(async ({ input }) => {
				const workspace = db.data.workspaces.find((w) => w.id === input.id);

				if (!workspace) {
					return { success: false, error: "Workspace not found" };
				}

				const workspacePath = workspace.path;

				await db.update((data) => {
					// Remove workspace
					data.workspaces = data.workspaces.filter((w) => w.id !== input.id);

					// Check if any other workspace uses this path
					const otherWorkspaceWithSamePath = data.workspaces.some(
						(w) => w.path === workspacePath,
					);

					// If no other workspace uses this path, remove from recents
					if (!otherWorkspaceWithSamePath) {
						data.recentProjects = data.recentProjects.filter(
							(p) => p.path !== workspacePath,
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
