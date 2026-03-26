import { env } from "main/env.main";
import { getHostServiceManager } from "main/lib/host-service-manager";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { loadToken } from "../auth/utils/auth-functions";

export const createHostServiceManagerRouter = () => {
	return router({
		getLocalPort: publicProcedure
			.input(z.object({ organizationId: z.string() }))
			.query(async ({ input }) => {
				const manager = getHostServiceManager();
				const { token } = await loadToken();
				if (token) {
					manager.setAuthToken(token);
				}
				manager.setCloudApiUrl(env.NEXT_PUBLIC_API_URL);
				const port = await manager.start(input.organizationId);
				const sessionToken = manager.getSessionToken(input.organizationId);
				return { port, sessionToken };
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
