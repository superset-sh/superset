import { getHostId } from "@superset/shared/host-info";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSelfUpdater, SelfUpdateError } from "../../../self-update";
import { protectedProcedure, router } from "../../index";

/**
 * Process-level operations on this host-service. `update` swaps a
 * standalone install in place and restarts the process; callers poll
 * `updateStatus` until the connection drops, then `health.check` until the
 * new version answers. `updateStatus.lastResult` says what happened in
 * between, read from a marker the restarting process leaves behind.
 */
export const systemRouter = router({
	updateStatus: protectedProcedure.query(() => getSelfUpdater().status()),

	update: protectedProcedure
		.input(
			z.object({
				version: z
					.string()
					.regex(/^\d+\.\d+\.\d+$/, "Expected a plain semver like 1.27.0")
					.optional(),
				force: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.userId)
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "An authenticated host owner is required to update",
				});
			const access = await ctx.api.host.authorizeUpdate.query(
				{
					organizationId: ctx.organizationId,
					machineId: getHostId(),
					userId: ctx.userId,
				},
				{ signal: AbortSignal.timeout(10_000) },
			);
			if (!access.allowed)
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only a host owner can update this host",
				});
			try {
				return getSelfUpdater().start(input);
			} catch (error) {
				if (error instanceof SelfUpdateError) {
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: error.message,
						cause: error,
					});
				}
				throw error;
			}
		}),
});
