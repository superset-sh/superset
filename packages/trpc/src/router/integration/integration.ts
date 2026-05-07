import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { authenticatedProcedure } from "../../trpc";
import { githubRouter } from "./github";
import { linearRouter } from "./linear";
import { slackRouter } from "./slack";
import { verifyOrgMembership } from "./utils";

export const integrationRouter = {
	github: githubRouter,
	linear: linearRouter,
	slack: slackRouter,

	list: authenticatedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.userId, input.organizationId);

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
