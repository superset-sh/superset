import { db } from "@superset/db/client";
import { apikeys } from "@superset/db/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, userError } from "../../trpc";

export const apiKeyRouter = {
	// API keys mint a session as their creator, so they are personal
	// credentials: list and revoke are scoped to the session user, never
	// the organization.
	list: protectedProcedure.query(async ({ ctx }) => {
		return db
			.select({
				id: apikeys.id,
				name: apikeys.name,
				start: apikeys.start,
				createdAt: apikeys.createdAt,
				lastRequest: apikeys.lastRequest,
			})
			.from(apikeys)
			.where(eq(apikeys.referenceId, ctx.session.user.id))
			.orderBy(desc(apikeys.createdAt));
	}),

	create: protectedProcedure
		.input(z.object({ name: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.activeOrganizationId;
			if (!organizationId) {
				throw userError({
					code: "BAD_REQUEST",
					message: "Active organization required to create an API key",
					i18nKey: "serverError.apiKey.activeOrganizationRequiredToCreate",
				});
			}

			const result = await ctx.auth.api.createApiKey({
				headers: ctx.headers,
				body: {
					name: input.name,
					metadata: { organizationId },
				},
			});

			return { key: result.key };
		}),

	revoke: protectedProcedure
		.input(z.object({ id: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.auth.api.deleteApiKey({
				headers: ctx.headers,
				body: { keyId: input.id },
			});
		}),
};
