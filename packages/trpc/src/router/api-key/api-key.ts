import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure } from "../../trpc";

export const apiKeyRouter = {
	create: protectedProcedure
		.input(z.object({ name: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.session.activeOrganizationId;
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

			return { key: result.key };
		}),
};
