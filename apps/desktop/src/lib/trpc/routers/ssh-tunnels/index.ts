import { getSshHostServiceManager } from "main/lib/ssh-hosts/manager";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const sshTunnelInputSchema = z.object({
	hostId: z.string().min(1),
});

export const createSshTunnelsRouter = () => {
	return router({
		probe: publicProcedure
			.input(sshTunnelInputSchema)
			.query(async ({ input }) => ({
				status: await getSshHostServiceManager().probe(input.hostId),
			})),

		connect: publicProcedure
			.input(sshTunnelInputSchema)
			.query(async ({ input }) => {
				const manager = getSshHostServiceManager();
				try {
					return {
						status: await manager.connect(input.hostId),
					};
				} catch {
					return {
						status: manager.getStatus(input.hostId),
					};
				}
			}),

		status: publicProcedure.input(sshTunnelInputSchema).query(({ input }) => ({
			status: getSshHostServiceManager().getStatus(input.hostId),
		})),

		healthcheck: publicProcedure
			.input(sshTunnelInputSchema)
			.query(async ({ input }) => {
				const manager = getSshHostServiceManager();
				try {
					return {
						status: await manager.healthcheck(input.hostId),
					};
				} catch {
					return {
						status: manager.getStatus(input.hostId),
					};
				}
			}),

		disconnect: publicProcedure
			.input(sshTunnelInputSchema)
			.mutation(async ({ input }) => {
				const manager = getSshHostServiceManager();
				await manager.disconnect(input.hostId);
				return {
					status: manager.getStatus(input.hostId),
				};
			}),
	});
};

export type SshTunnelsRouter = ReturnType<typeof createSshTunnelsRouter>;
