import { observable } from "@trpc/server/observable";
import { env } from "main/env.main";
import {
	getHostServiceManager,
	type HostServiceStatusEvent,
} from "main/lib/host-service-manager";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { loadToken } from "../auth/utils/auth-functions";

export const createHostServiceManagerRouter = () => {
	return router({
		getLocalPort: publicProcedure
			.input(
				z.object({
					organizationId: z.string(),
					organizationName: z.string().optional(),
				}),
			)
			.query(async ({ input }) => {
				const manager = getHostServiceManager();
				const { token } = await loadToken();
				if (token) {
					manager.setAuthToken(token);
				}
				manager.setCloudApiUrl(env.NEXT_PUBLIC_API_URL);
				if (input.organizationName) {
					manager.setOrganizationName(
						input.organizationId,
						input.organizationName,
					);
				}
				const port = await manager.start(input.organizationId);
				const secret = manager.getSecret(input.organizationId);
				return { port, secret };
			}),

		getStatus: publicProcedure
			.input(z.object({ organizationId: z.string() }))
			.query(({ input }) => {
				const manager = getHostServiceManager();
				const status = manager.getStatus(input.organizationId);
				return { status };
			}),

		getServiceInfo: publicProcedure
			.input(z.object({ organizationId: z.string() }))
			.query(({ input }) => {
				const manager = getHostServiceManager();
				return manager.getServiceInfo(input.organizationId);
			}),

		restart: publicProcedure
			.input(z.object({ organizationId: z.string() }))
			.mutation(async ({ input }) => {
				const manager = getHostServiceManager();
				const { token } = await loadToken();
				if (token) {
					manager.setAuthToken(token);
				}
				manager.setCloudApiUrl(env.NEXT_PUBLIC_API_URL);
				const port = await manager.restart(input.organizationId);
				const secret = manager.getSecret(input.organizationId);
				return { port, secret };
			}),

		onStatusChange: publicProcedure.subscription(() => {
			return observable<HostServiceStatusEvent>((emit) => {
				const manager = getHostServiceManager();

				const handler = (event: HostServiceStatusEvent) => {
					emit.next(event);
				};

				manager.on("status-changed", handler);

				return () => {
					manager.off("status-changed", handler);
				};
			});
		}),
	});
};
