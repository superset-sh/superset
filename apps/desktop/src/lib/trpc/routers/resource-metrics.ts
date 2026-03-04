import { collectResourceMetrics } from "main/lib/resource-metrics";
import { z } from "zod";
import { publicProcedure, router } from "..";
import {
	resourceMetricsSnapshotSchema,
	validateResourceMetricsSnapshot,
} from "./resource-metrics.schema";

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
			.output(resourceMetricsSnapshotSchema)
			.query(async ({ input }) => {
				const snapshot = await collectResourceMetrics({
					mode: input?.mode,
					force: input?.force,
				});
				const validation = validateResourceMetricsSnapshot(snapshot);
				if (!validation.isValid) {
					console.warn(
						"[resource-metrics] Invalid snapshot payload; returning fallback snapshot",
						validation.issues,
					);
				}
				return validation.snapshot;
			}),
	});
};
