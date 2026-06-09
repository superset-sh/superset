import { observable } from "@trpc/server/observable";
import { getMainApiUrl } from "main/lib/desktop-runtime-flags";
import {
	getHostServiceCoordinator,
	type HostServiceStatusEvent,
} from "main/lib/host-service-coordinator";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { loadToken } from "../auth/utils/auth-functions";

const orgInput = z.object({ organizationId: z.string() });

export const createHostServiceCoordinatorRouter = () => {
	return router({
		start: publicProcedure.input(orgInput).mutation(async ({ input }) => {
			const coordinator = getHostServiceCoordinator();
			const { token } = await loadToken();
			if (!token) {
				throw new Error("No auth token available — user must be logged in");
			}
			return coordinator.start(input.organizationId, {
				authToken: token,
				cloudApiUrl: getMainApiUrl(),
			});
		}),

		getConnection: publicProcedure.input(orgInput).query(({ input }) => {
			const coordinator = getHostServiceCoordinator();
			return coordinator.getConnection(input.organizationId);
		}),

		getProcessStatus: publicProcedure.input(orgInput).query(({ input }) => {
			const coordinator = getHostServiceCoordinator();
			return { status: coordinator.getProcessStatus(input.organizationId) };
		}),

		restart: publicProcedure.input(orgInput).mutation(async ({ input }) => {
			const coordinator = getHostServiceCoordinator();
			const { token } = await loadToken();
			if (!token) {
				throw new Error("No auth token available — user must be logged in");
			}
			return coordinator.restart(input.organizationId, {
				authToken: token,
				cloudApiUrl: getMainApiUrl(),
			});
		}),

		reset: publicProcedure.input(orgInput).mutation(async ({ input }) => {
			const coordinator = getHostServiceCoordinator();
			const { token } = await loadToken();
			if (!token) {
				throw new Error("No auth token available — user must be logged in");
			}
			return coordinator.reset(input.organizationId, {
				authToken: token,
				cloudApiUrl: getMainApiUrl(),
			});
		}),

		onStatusChange: publicProcedure.subscription(() => {
			return observable<HostServiceStatusEvent>((emit) => {
				const coordinator = getHostServiceCoordinator();
				const handler = (event: HostServiceStatusEvent) => emit.next(event);
				coordinator.on("status-changed", handler);
				return () => coordinator.off("status-changed", handler);
			});
		}),
	});
};
