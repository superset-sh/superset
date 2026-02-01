import { db } from "@superset/db/client";
import { feedback } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure } from "../../trpc";

export const feedbackRouter = {
	create: protectedProcedure
		.input(
			z.object({
				message: z.string().min(1).max(10000),
				images: z.array(z.string()).max(10).default([]),
				metadata: z.record(z.string(), z.unknown()).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const [created] = await db
				.insert(feedback)
				.values({
					userId: ctx.session.user.id,
					organizationId: ctx.session.session.activeOrganizationId,
					message: input.message,
					images: input.images,
					metadata: input.metadata,
				})
				.returning();

			console.log(
				"[feedback/create] Feedback submitted by user:",
				ctx.session.user.id,
			);

			return created;
		}),
} satisfies TRPCRouterRecord;
