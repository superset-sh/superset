import { observable } from "@trpc/server/observable";
import { portForwardManager, setRelayToken } from "main/lib/port-forward";
import type { PortForward } from "shared/types";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createPortForwardsRouter = () => {
	return router({
		setRelayToken: publicProcedure
			.input(z.object({ token: z.string().nullable() }))
			.mutation(({ input }) => {
				setRelayToken(input.token);
			}),

		list: publicProcedure.query((): PortForward[] => portForwardManager.list()),

		subscribe: publicProcedure
			.input(z.object({ clientId: z.string() }))
			.subscription(({ input }) => {
				return observable<PortForward[]>((emit) => {
					const onChange = (forwards: PortForward[]) => emit.next(forwards);
					portForwardManager.on("change", onChange);
					emit.next(portForwardManager.list());
					return () => {
						portForwardManager.off("change", onChange);
						// The subscription is per window; its teardown is how the
						// manager learns a window (and its wanted set) is gone.
						void portForwardManager.releaseClient(input.clientId);
					};
				});
			}),

		sync: publicProcedure
			.input(
				z.object({
					clientId: z.string(),
					hostUrl: z.string(),
					workspaceId: z.string(),
					ports: z.array(z.number().int().positive()),
				}),
			)
			.mutation(
				({ input }): Promise<PortForward[]> => portForwardManager.sync(input),
			),

		retryEphemeral: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => portForwardManager.retryEphemeral(input.id)),

		killLocalOwner: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => portForwardManager.killLocalOwner(input.id)),
	});
};
