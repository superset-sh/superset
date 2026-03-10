import { getWorkspaceServiceManager } from "main/lib/workspace-service-manager";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createWorkspaceServiceManagerRouter = () => {
	return router({
		getLocalPort: publicProcedure
			.input(z.object({ organizationId: z.string() }))
			.query(async ({ input }) => {
				const manager = getWorkspaceServiceManager();
				const port = await manager.start(input.organizationId);
				return { port };
			}),

		getStatus: publicProcedure
			.input(z.object({ organizationId: z.string() }))
			.query(({ input }) => {
				const manager = getWorkspaceServiceManager();
				const status = manager.getStatus(input.organizationId);
				return { status };
			}),
	});
};
