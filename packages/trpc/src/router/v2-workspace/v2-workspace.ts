import { dbWs } from "@superset/db/client";
import { v2Workspaces } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../integration/utils";

export const v2WorkspaceRouter = {
	create: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				name: z.string().min(1),
				branch: z.string().optional(),
				deviceId: z.string().uuid().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization",
				});
			}
			await verifyOrgMembership(ctx.session.user.id, organizationId);
			const [workspace] = await dbWs
				.insert(v2Workspaces)
				.values({
					organizationId,
					projectId: input.projectId,
					name: input.name,
					branch: input.branch,
					deviceId: input.deviceId,
					createdByUserId: ctx.session.user.id,
				})
				.returning();
			return workspace;
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).optional(),
				branch: z.string().optional(),
				deviceId: z.string().uuid().nullish(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization",
				});
			}
			await verifyOrgMembership(ctx.session.user.id, organizationId);
			const { id, ...data } = input;
			const [updated] = await dbWs
				.update(v2Workspaces)
				.set(data)
				.where(
					and(
						eq(v2Workspaces.id, id),
						eq(v2Workspaces.organizationId, organizationId),
					),
				)
				.returning();
			return updated;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization",
				});
			}
			await verifyOrgAdmin(ctx.session.user.id, organizationId);
			await dbWs
				.delete(v2Workspaces)
				.where(
					and(
						eq(v2Workspaces.id, input.id),
						eq(v2Workspaces.organizationId, organizationId),
					),
				);
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
