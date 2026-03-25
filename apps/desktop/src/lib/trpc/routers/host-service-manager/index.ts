import { sshHostConfigSchema } from "@superset/local-db";
import { env } from "main/env.main";
import { getHostServiceManager } from "main/lib/host-service-manager";
import { getSshHostServiceManager } from "main/lib/ssh-hosts/manager";
import {
	listSshHosts,
	removeSshHost,
	upsertSshHost,
} from "main/lib/ssh-hosts/settings";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { loadToken } from "../auth/utils/auth-functions";

const sshHostInputSchema = sshHostConfigSchema.extend({
	name: z.string().trim().min(1),
	sshTarget: z.string().trim().min(1),
	remoteRootDir: z.string().trim().min(1).optional(),
});

async function configureLocalHostServiceManager() {
	const manager = getHostServiceManager();
	const { token } = await loadToken();
	manager.setAuthToken(token ?? null);
	manager.setCloudApiUrl(env.NEXT_PUBLIC_API_URL);
	return manager;
}

export const createHostServiceManagerRouter = () => {
	return router({
		getLocalPort: publicProcedure
			.input(z.object({ organizationId: z.string() }))
			.query(async ({ input }) => {
				const manager = await configureLocalHostServiceManager();
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

		sshHosts: router({
			list: publicProcedure.query(() => listSshHosts()),

			upsert: publicProcedure
				.input(sshHostInputSchema)
				.mutation(({ input }) => {
					const remoteRootDir = input.remoteRootDir?.trim();
					return upsertSshHost({
						...input,
						remoteRootDir:
							remoteRootDir && remoteRootDir.length > 0
								? remoteRootDir
								: undefined,
					});
				}),

			remove: publicProcedure
				.input(z.object({ hostId: z.string().min(1) }))
				.mutation(async ({ input }) => {
					await getSshHostServiceManager().disconnectHost(input.hostId);
					return removeSshHost(input.hostId);
				}),
		}),
	});
};
