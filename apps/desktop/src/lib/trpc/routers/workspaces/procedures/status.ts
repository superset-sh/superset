import { workspaces } from "@superset/local-db";
import { and, eq, isNull } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import { getWorkspaceNotDeleting, touchWorkspace } from "../utils/db-helpers";

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
					}),
				}),
			)
			.mutation(({ input }) => {
				const workspace = getWorkspaceNotDeleting(input.id);
				if (!workspace) {
					throw new Error(
						`Workspace ${input.id} not found or is being deleted`,
					);
				}

				touchWorkspace(input.id, {
					...(input.patch.name !== undefined && { name: input.patch.name }),
				});

				return { success: true };
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
