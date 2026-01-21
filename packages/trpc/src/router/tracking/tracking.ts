import { db } from "@superset/db/client";
import { trackedBranches } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";

export const trackingRouter = {
	recordBranch: protectedProcedure
		.input(
			z.object({
				repoOwner: z.string().min(1),
				repoName: z.string().min(1),
				branchName: z.string().min(1),
				baseBranch: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await db
				.insert(trackedBranches)
				.values({
					userId: ctx.session.user.id,
					repoOwner: input.repoOwner,
					repoName: input.repoName,
					branchName: input.branchName,
					baseBranch: input.baseBranch,
				})
				.onConflictDoNothing();

			return { success: true };
		}),
} satisfies TRPCRouterRecord;
