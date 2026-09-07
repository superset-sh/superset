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
		.mutation(({ input }) => {
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
