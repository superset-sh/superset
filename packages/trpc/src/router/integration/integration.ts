import { db } from "@superset/db/client";
import { integrationConnections, members } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { githubRouter } from "./github";
import { linearRouter } from "./linear";

export const integrationRouter = {
	github: githubRouter,
	linear: linearRouter,

	list: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			const membership = await db.query.members.findFirst({
				where: and(
					eq(members.organizationId, input.organizationId),
					eq(members.userId, ctx.session.user.id),
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
