import { workspaces, worktrees } from "@superset/local-db";
import { and, eq, isNull } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import { getWorkspaceNotDeleting, touchWorkspace, getWorktree } from "../utils/db-helpers";

export const createStatusProcedures = () => {
	return router({
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
					.where(
						and(
							eq(workspaces.projectId, projectId),
							isNull(workspaces.deletingAt),
						),
					)
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

		update: publicProcedure
			.input(
				z.object({
					id: z.string(),
					patch: z.object({
						name: z.string().optional(),
						renameFolder: z.boolean().optional(),
					}),
				}),
			)
			.mutation(async ({ input }) => {
				const workspace = getWorkspaceNotDeleting(input.id);
				if (!workspace) {
					throw new Error(
						`Workspace ${input.id} not found or is being deleted`,
					);
				}

				let renamedPaths: { oldPath: string, newPath: string } | undefined;

				if (input.patch.renameFolder && input.patch.name && workspace.type === "worktree" && workspace.worktreeId) {
					const worktree = getWorktree(workspace.worktreeId);
					if (worktree) {
						const { dirname, join } = await import("path");
						const newPath = join(dirname(worktree.path), input.patch.name);
						
						// Need to use git worktree move
						try {
							const { exec } = await import("child_process");
							const { promisify } = await import("util");
							const execAsync = promisify(exec);
							await execAsync(`git worktree move "${worktree.path}" "${newPath}"`, {
								cwd: dirname(worktree.path)
							});
							
							// Update worktree in db
							localDb.update(worktrees).set({ path: newPath }).where(eq(worktrees.id, worktree.id)).run();
							renamedPaths = { oldPath: worktree.path, newPath };
						} catch (e) {
							console.error("Failed to rename worktree folder:", e);
						}
					}
				}

				touchWorkspace(input.id, {
					...(input.patch.name !== undefined && { name: input.patch.name }),
				});

				return { success: true, renamedPaths };
			}),

		setUnread: publicProcedure
			.input(z.object({ id: z.string(), isUnread: z.boolean() }))
			.mutation(({ input }) => {
				const workspace = getWorkspaceNotDeleting(input.id);
				if (!workspace) {
					throw new Error(
						`Workspace ${input.id} not found or is being deleted`,
					);
				}

				localDb
					.update(workspaces)
					.set({ isUnread: input.isUnread })
					.where(eq(workspaces.id, input.id))
					.run();

				return { success: true, isUnread: input.isUnread };
			}),
	});
};
