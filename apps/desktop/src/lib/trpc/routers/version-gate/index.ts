import { getVersionGateStatus } from "main/lib/version-gate";
import { publicProcedure, router } from "../..";

export const createVersionGateRouter = () => {
	return router({
		getStatus: publicProcedure.query(async () => {
			return getVersionGateStatus();
		}),

		refresh: publicProcedure.mutation(async () => {
			return getVersionGateStatus({ refresh: true });
		}),
	});
};

export type VersionGateRouter = ReturnType<typeof createVersionGateRouter>;
