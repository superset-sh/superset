import { workspaceSections, workspaces, worktrees } from "@superset/local-db";
import { and, eq, isNull, not } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import {
	getWorkspaceNotDeleting,
	setLastActiveWorkspace,
	touchWorkspace,
} from "../utils/db-helpers";
import {
	getProjectChildItems,
	reorderProjectChildItems,
} from "../utils/project-children-order";

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

		reorderProjectChildren: publicProcedure
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
					.all();
				const projectSections = localDb
					.select()
					.from(workspaceSections)
					.where(eq(workspaceSections.projectId, projectId))
					.all();

				const items = getProjectChildItems(
					projectId,
					projectWorkspaces,
					projectSections,
				);

				reorderProjectChildItems(items, fromIndex, toIndex);

				for (const item of items) {
					if (item.kind === "workspace") {
						localDb
							.update(workspaces)
							.set({ tabOrder: item.tabOrder })
							.where(eq(workspaces.id, item.id))
							.run();
						continue;
					}

					localDb
						.update(workspaceSections)
						.set({ tabOrder: item.tabOrder })
						.where(eq(workspaceSections.id, item.id))
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
						preserveUnnamedStatus: z.boolean().optional(),
						isUnnamed: z.boolean().optional(),
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

				const resolveIsUnnamed = () => {
					if (input.patch.isUnnamed !== undefined) return input.patch.isUnnamed;
					if (
						input.patch.name !== undefined &&
						!input.patch.preserveUnnamedStatus
					)
						return false;
					return undefined;
				};

				const isUnnamed = resolveIsUnnamed();

				touchWorkspace(input.id, {
					...(input.patch.name !== undefined && { name: input.patch.name }),
					...(isUnnamed !== undefined && { isUnnamed }),
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

		setNotes: publicProcedure
			.input(z.object({ id: z.string(), notes: z.string() }))
			.mutation(({ input }) => {
				const workspace = getWorkspaceNotDeleting(input.id);
				if (!workspace) {
					throw new Error(
						`Workspace ${input.id} not found or is being deleted`,
					);
				}

				localDb
					.update(workspaces)
					.set({ notes: input.notes })
					.where(eq(workspaces.id, input.id))
					.run();

				return { success: true };
			}),

		setActive: publicProcedure
			.input(z.object({ workspaceId: z.string() }))
			.mutation(({ input }) => {
				const workspace = getWorkspaceNotDeleting(input.workspaceId);
				if (!workspace) {
					throw new Error(
						`Workspace ${input.workspaceId} not found or is being deleted`,
					);
				}

				setLastActiveWorkspace(input.workspaceId);

				return { success: true, workspaceId: input.workspaceId };
			}),

		syncBranch: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					branch: z.string(),
				}),
			)
			.mutation(({ input }) => {
				const { workspaceId, branch } = input;

				if (!branch || branch === "HEAD") {
					return { success: false as const, reason: "invalid-branch" as const };
				}

				const workspace = getWorkspaceNotDeleting(workspaceId);
				if (!workspace) {
					return { success: false as const, reason: "not-found" as const };
				}

				if (workspace.branch === branch) {
					return { success: true as const, changed: false as const };
				}

				localDb
					.update(workspaces)
					.set({ branch })
					.where(eq(workspaces.id, workspaceId))
					.run();

				if (workspace.worktreeId) {
					localDb
						.update(worktrees)
						.set({ branch })
						.where(
							and(
								eq(worktrees.id, workspace.worktreeId),
								not(eq(worktrees.branch, branch)),
							),
						)
						.run();
				}

				return { success: true as const, changed: true as const };
			}),
	});
};
