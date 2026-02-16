import { dbWs } from "@superset/db/client";
import {
	workspaceConfigSchema,
	workspaces,
	workspaceTypeEnum,
} from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../integration/utils";

export const workspaceRouter = {
	create: protectedProcedure
		.input(
			z.object({
				projectId: z.string().uuid(),
				organizationId: z.string().uuid(),
				name: z.string().min(1),
				type: workspaceTypeEnum,
				config: workspaceConfigSchema,
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);
			const [workspace] = await dbWs
				.insert(workspaces)
				.values({
					projectId: input.projectId,
					organizationId: input.organizationId,
					name: input.name,
					type: input.type,
					config: input.config,
					createdByUserId: ctx.session.user.id,
				})
				.returning();
			return workspace;
		}),

	delete: protectedProcedure
		.input(
			z.object({ id: z.string().uuid(), organizationId: z.string().uuid() }),
		)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);
			await dbWs
				.delete(workspaces)
				.where(
					and(
						eq(workspaces.id, input.id),
						eq(workspaces.organizationId, input.organizationId),
					),
				);
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
