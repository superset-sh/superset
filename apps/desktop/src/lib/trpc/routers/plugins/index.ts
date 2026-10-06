import { TRPCError } from "@trpc/server";
import {
	installPlugin,
	setPluginEnabled,
	syncInstalledPluginMcpServers,
	uninstallPlugin,
} from "main/lib/plugin-installs";
import { z } from "zod";
import { publicProcedure, router } from "../..";

/**
 * Materialization only: agent config and the local install record are
 * written here, never read back for display. Install state is the account's —
 * the UI reads plugins.list — so it is the same on every machine. Skills,
 * bundled and the user's own, live on the `skills` router.
 */
export const createPluginsRouter = () => {
	return router({
		install: publicProcedure
			.input(z.object({ name: z.string().min(1) }))
			.mutation(({ input }) => {
				const installed = installPlugin(input.name);
				if (installed === null) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: `Unknown plugin: ${input.name}`,
					});
				}
				return { installed };
			}),

		uninstall: publicProcedure
			.input(z.object({ name: z.string().min(1) }))
			.mutation(({ input }) => {
				return { installed: uninstallPlugin(input.name) };
			}),

		setEnabled: publicProcedure
			.input(z.object({ name: z.string().min(1), enabled: z.boolean() }))
			.mutation(({ input }) => {
				return { installed: setPluginEnabled(input.name, input.enabled) };
			}),

		/** The account list is the server's, so main cannot discover the split itself. */
		syncConnections: publicProcedure
			.input(
				z.object({
					connections: z.array(
						z.object({
							connector: z.string().min(1),
							connectionId: z.string().min(1),
							externalUserId: z.string().nullable(),
							nickname: z.string().nullable(),
							label: z.string().nullable(),
						}),
					),
				}),
			)
			.mutation(({ input }) => {
				syncInstalledPluginMcpServers(input.connections);
				return { ok: true };
			}),
	});
};
