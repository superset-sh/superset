import { TRPCError } from "@trpc/server";
import {
	getInstalledPlugins,
	installPlugin,
	uninstallPlugin,
} from "main/lib/plugin-installs";
import { z } from "zod";
import { publicProcedure, router } from "../..";

/**
 * Install state for the Plugins page. The catalog itself is static data the
 * renderer imports from @superset/shared/plugins; this router only owns the
 * installed set and the materialization side effects (main/lib/plugin-installs).
 */
export const createPluginsRouter = () => {
	return router({
		listInstalled: publicProcedure.query(() => {
			return getInstalledPlugins();
		}),

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
	});
};
