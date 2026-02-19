import { AgentManager } from "main/lib/agent-manager/agent-manager";
import { getHashedDeviceId } from "main/lib/device-info";
import { z } from "zod";
import { publicProcedure, router } from "../..";

let agentManager: AgentManager | null = null;

export const createAgentManagerRouter = () => {
	return router({
		/**
		 * Start (or restart) the AgentManager for the given organization.
		 * Called by the renderer when auth is ready and the active org is known.
		 */
		start: publicProcedure
			.input(z.object({ organizationId: z.string(), authToken: z.string() }))
			.mutation(async ({ input }) => {
				const deviceId = getHashedDeviceId();

				if (agentManager) {
					await agentManager.restart({
						organizationId: input.organizationId,
						deviceId,
						authToken: input.authToken,
					});
				} else {
					agentManager = new AgentManager({
						deviceId,
						organizationId: input.organizationId,
						authToken: input.authToken,
					});
					await agentManager.start();
				}

				return { success: true };
			}),

		stop: publicProcedure.mutation(() => {
			if (agentManager) {
				agentManager.stop();
				agentManager = null;
			}
			return { success: true };
		}),
	});
};

export type AgentManagerRouter = ReturnType<typeof createAgentManagerRouter>;
