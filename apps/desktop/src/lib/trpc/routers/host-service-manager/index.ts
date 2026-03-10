import { getHostServiceManager } from "main/lib/host-service-manager";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createHostServiceManagerRouter = () => {
	return router({
		getLocalPort: publicProcedure
			.input(z.object({ organizationId: z.string() }))
			.query(async ({ input }) => {
				const manager = getHostServiceManager();
				const port = await manager.start(input.organizationId);
				return { port };
			}),

		getStatus: publicProcedure
			.input(z.object({ organizationId: z.string() }))
			.query(({ input }) => {
				const manager = getHostServiceManager();
				const status = manager.getStatus(input.organizationId);
				return { status };
			}),
	});
};
