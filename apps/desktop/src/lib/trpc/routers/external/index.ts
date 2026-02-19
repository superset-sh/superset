import { EXTERNAL_APPS, projects } from "@superset/local-db";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { clipboard, shell } from "electron";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	type ExternalApp,
	getAppCommand,
	resolvePath,
	spawnAsync,
} from "./helpers";

const ExternalAppSchema = z.enum(EXTERNAL_APPS);

async function openPathInApp(
	filePath: string,
	app: ExternalApp,
): Promise<void> {
	if (app === "finder") {
		shell.showItemInFolder(filePath);
		return;
	}

	const candidates = getAppCommand(app, filePath);
	if (candidates) {
		let lastError: Error | undefined;
		for (const cmd of candidates) {
			try {
				await spawnAsync(cmd.command, cmd.args);
				return;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				if (candidates.length > 1) {
					console.warn(
						`[external/openInApp] ${cmd.args[1]} not found, trying next candidate`,
					);
				}
			}
		}
		throw lastError;
	}

	await shell.openPath(filePath);
}

/**
 * External operations router.
 * Handles opening URLs and files in external applications.
 */
export const createExternalRouter = () => {
	return router({
		openUrl: publicProcedure.input(z.string()).mutation(async ({ input }) => {
			try {
				await shell.openExternal(input);
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				console.error("[external/openUrl] Failed to open URL:", input, error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: errorMessage,
				});
			}
		}),

		openInFinder: publicProcedure
			.input(z.string())
			.mutation(async ({ input }) => {
				shell.showItemInFolder(input);
			}),

		openInApp: publicProcedure
			.input(
				z.object({
					path: z.string(),
					app: ExternalAppSchema,
					projectId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				if (input.projectId) {
					localDb
						.update(projects)
						.set({ defaultApp: input.app })
						.where(eq(projects.id, input.projectId))
						.run();
				}
				await openPathInApp(input.path, input.app);
			}),

		copyPath: publicProcedure.input(z.string()).mutation(async ({ input }) => {
			clipboard.writeText(input);
		}),

		openFileInEditor: publicProcedure
			.input(
				z.object({
					path: z.string(),
					line: z.number().optional(),
					column: z.number().optional(),
					cwd: z.string().optional(),
					projectId: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const filePath = resolvePath(input.path, input.cwd);
				let app: ExternalApp = "cursor";
				if (input.projectId) {
					const project = localDb
						.select()
						.from(projects)
						.where(eq(projects.id, input.projectId))
						.get();
					app = project?.defaultApp ?? "cursor";
				}
				await openPathInApp(filePath, app);
			}),
	});
};

export type ExternalRouter = ReturnType<typeof createExternalRouter>;
