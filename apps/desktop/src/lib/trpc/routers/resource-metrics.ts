import { collectResourceMetrics } from "main/lib/resource-metrics";
import { z } from "zod";
import { publicProcedure, router } from "..";

const getSnapshotInputSchema = z
	.object({
		mode: z.enum(["interactive", "idle"]).optional(),
		force: z.boolean().optional(),
	})
	.optional();

export const createResourceMetricsRouter = () => {
	return router({
		getSnapshot: publicProcedure
			.input(getSnapshotInputSchema)
			.query(async ({ input }) => {
				return collectResourceMetrics({
					mode: input?.mode,
					force: input?.force,
				});
			}),
	});
};
