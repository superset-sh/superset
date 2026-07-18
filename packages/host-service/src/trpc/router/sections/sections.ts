import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getLocalWorkspace } from "../../../workspaces/local-workspace-store";
import {
	createSection,
	deleteSection,
	getSection,
	listSections,
	moveWorkspaceToSection,
	reorderSections,
	reorderWorkspacesInSection,
	updateSection,
} from "../../../workspaces/sidebar-sections-store";
import { protectedProcedure, router } from "../../index";

/**
 * Host-owned sidebar sections (workspace groups). Workspaces reference a
 * section id opaquely — it may live on another host — so `moveWorkspace`
 * only validates sections it can see locally.
 */
export const sectionsRouter = router({
	list: protectedProcedure
		.input(z.object({ projectId: z.string().optional() }).optional())
		.query(({ ctx, input }) => listSections(ctx.db, input?.projectId)),

	create: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid().optional(),
				projectId: z.string(),
				name: z.string().trim().min(1),
				color: z.string().nullable().optional(),
				tabOrder: z.number().int().optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const project = ctx.db.query.projects
				.findFirst({
					where: (projects, { eq }) => eq(projects.id, input.projectId),
				})
				.sync();
			if (!project) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found on this host",
				});
			}
			return createSection(ctx, {
				id: input.id,
				projectId: input.projectId,
				name: input.name,
				color: input.color,
				tabOrder: input.tabOrder,
			});
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().trim().min(1).optional(),
				color: z.string().nullable().optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const patch: { name?: string; color?: string | null } = {};
			if (input.name !== undefined) patch.name = input.name;
			if (input.color !== undefined) patch.color = input.color;
			// Empty patch = no-op read; both paths 404 on a missing section.
			const updated =
				Object.keys(patch).length === 0
					? getSection(ctx.db, input.id)
					: updateSection(ctx, input.id, patch);
			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace group not found",
				});
			}
			return updated;
		}),

	/** Un-groups members — workspaces are never deleted. */
	delete: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(({ ctx, input }) => {
			const deleted = deleteSection(ctx, input.id);
			if (!deleted) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace group not found",
				});
			}
			return { success: true as const };
		}),

	moveWorkspace: protectedProcedure
		.input(
			z.object({
				workspaceId: z.string().uuid(),
				sectionId: z.string().uuid().nullable(),
				tabOrder: z.number().int().optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const workspace = getLocalWorkspace(ctx.db, input.workspaceId);
			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}
			if (input.sectionId !== null) {
				const section = getSection(ctx.db, input.sectionId);
				if (section && section.projectId !== workspace.projectId) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"Cannot move a workspace to a group from a different project",
					});
				}
			}
			const row = moveWorkspaceToSection(ctx, {
				workspaceId: input.workspaceId,
				sectionId: input.sectionId,
				tabOrder: input.tabOrder,
			});
			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}
			return row;
		}),

	reorder: protectedProcedure
		.input(
			z.object({
				items: z
					.array(
						z.object({
							id: z.string().uuid(),
							tabOrder: z.number().int(),
						}),
					)
					.min(1),
			}),
		)
		.mutation(({ ctx, input }) => {
			reorderSections(ctx, input.items);
			return { success: true as const };
		}),

	reorderInSection: protectedProcedure
		.input(
			z.object({
				sectionId: z.string().uuid(),
				workspaceIds: z.array(z.string().uuid()).min(1),
			}),
		)
		.mutation(({ ctx, input }) => {
			const section = getSection(ctx.db, input.sectionId);
			if (!section) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace group not found",
				});
			}
			reorderWorkspacesInSection(ctx, input.sectionId, input.workspaceIds);
			return { success: true as const };
		}),
});
