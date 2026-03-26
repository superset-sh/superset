import { env } from "main/env.main";
import { getHostServiceManager } from "main/lib/host-service-manager";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { loadToken } from "../auth/utils/auth-functions";

export const createHostServiceManagerRouter = () => {
	return router({
		syncAuth: publicProcedure
			.input(
				z.object({
					token: z.string().nullish(),
					expiresAt: z.string().nullish(),
				}),
			)
			.mutation(({ input }) => {
				const manager = getHostServiceManager();
				const hasValidToken =
					typeof input.token === "string" &&
					input.token.length > 0 &&
					typeof input.expiresAt === "string" &&
					new Date(input.expiresAt).getTime() > Date.now();
				const nextToken: string | null =
					hasValidToken && typeof input.token === "string" ? input.token : null;

				manager.syncAuth(nextToken, env.NEXT_PUBLIC_API_URL);

				return { success: true };
			}),

		getLocalPort: publicProcedure
			.input(z.object({ organizationId: z.string() }))
			.query(async ({ input }) => {
				const manager = getHostServiceManager();
				const { token, expiresAt } = await loadToken();
				const hasValidToken =
					typeof token === "string" &&
					token.length > 0 &&
					typeof expiresAt === "string" &&
					new Date(expiresAt).getTime() > Date.now();

				manager.syncAuth(hasValidToken ? token : null, env.NEXT_PUBLIC_API_URL);
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
