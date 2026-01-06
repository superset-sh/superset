import { db } from "@superset/db/client";
import {
	integrationConnections,
	organizationMembers,
	users,
} from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { linearRouter } from "./linear";

export const integrationRouter = {
	linear: linearRouter,

	list: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const user = await db.query.users.findFirst({
				where: eq(users.clerkId, ctx.userId),
			});
			if (!user) {
				throw new Error("User not found");
			}

			const membership = await db.query.organizationMembers.findFirst({
				where: and(
					eq(organizationMembers.organizationId, input.organizationId),
					eq(organizationMembers.userId, user.id),
				),
			});
			if (!membership) {
				throw new Error("Not a member of this organization");
			}

			return db.query.integrationConnections.findMany({
				where: eq(integrationConnections.organizationId, input.organizationId),
				columns: {
					id: true,
					provider: true,
					externalOrgId: true,
					externalOrgName: true,
					config: true,
					createdAt: true,
					updatedAt: true,
				},
			});
		}),
} satisfies TRPCRouterRecord;
