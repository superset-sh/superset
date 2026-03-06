import { collectResourceMetrics } from "main/lib/resource-metrics";
import { publicProcedure, router } from "..";

export const createResourceMetricsRouter = () => {
	return router({
		getSnapshot: publicProcedure.query(async () => {
			return collectResourceMetrics();
		}),
	});
};
