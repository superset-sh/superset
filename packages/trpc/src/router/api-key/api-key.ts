import { db } from "@superset/db/client";
import { apikeys } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";

export const apiKeyRouter = {
	list: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		return db
			.select({
				id: apikeys.id,
				name: apikeys.name,
				start: apikeys.start,
				createdAt: apikeys.createdAt,
				lastRequest: apikeys.lastRequest,
			})
			.from(apikeys)
			.where(eq(apikeys.organizationId, organizationId))
			.orderBy(desc(apikeys.createdAt));
	}),

	create: protectedProcedure
		.input(z.object({ name: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Active organization required to create an API key",
				});
			}

			const result = await ctx.auth.api.createApiKey({
				headers: ctx.headers,
				body: {
					name: input.name,
					metadata: { organizationId },
				},
			});

			return { id: result.id, key: result.key };
		}),
};
