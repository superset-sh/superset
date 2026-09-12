import { db } from "@superset/db/client";
import { integrationConnections } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import { connectionStatusProcedure } from "./connection-status";
import { githubRouter } from "./github";
import { googleRouter } from "./google";
import { linearRouter } from "./linear";
import { microsoftTeamsRouter } from "./microsoft-teams";
import { notionRouter } from "./notion";
import { sentryRouter } from "./sentry";
import { slackRouter } from "./slack";
import { triggerOptionsRouter } from "./trigger-options";
import { verifyOrgMembership } from "./utils";

export const integrationRouter = {
	github: githubRouter,
	google: googleRouter,
	linear: linearRouter,
	microsoftTeams: microsoftTeamsRouter,
	notion: notionRouter,
	sentry: sentryRouter,
	slack: slackRouter,
	...triggerOptionsRouter,

	/** Which providers are connected, for the trigger editor. */
	connectionStatus: connectionStatusProcedure,

	list: protectedProcedure
		.input(z.object({ organizationId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			return db.query.integrationConnections.findMany({
				where: eq(integrationConnections.organizationId, input.organizationId),
				columns: {
					id: true,
					provider: true,
					externalOrgId: true,
					externalOrgName: true,
					createdAt: true,
					updatedAt: true,
				},
			});
		}),
} satisfies TRPCRouterRecord;
