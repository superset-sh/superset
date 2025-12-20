import { clipboard, shell } from "electron";
import { db } from "main/lib/db";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import {
	EXTERNAL_APPS,
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

	const cmd = getAppCommand(app, filePath);
	if (cmd) {
		await spawnAsync(cmd.command, cmd.args);
		return;
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
			await shell.openExternal(input);
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
				}),
			)
			.mutation(async ({ input }) => {
				await db.update((data) => {
					data.settings.lastUsedApp = input.app;
				});
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
				}),
			)
			.mutation(async ({ input }) => {
				const filePath = resolvePath(input.path, input.cwd);
				const app = db.data.settings.lastUsedApp ?? "cursor";
				await openPathInApp(filePath, app);
			}),
	});
};

export type ExternalRouter = ReturnType<typeof createExternalRouter>;
