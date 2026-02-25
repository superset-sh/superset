import {
	EXTERNAL_APPS,
	NON_EDITOR_APPS,
	projects,
	settings,
} from "@superset/local-db";
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

const nonEditorSet = new Set<ExternalApp>(NON_EDITOR_APPS);

/** Sets the global default editor if one hasn't been set yet. Skips non-editor apps. */
function ensureGlobalDefaultEditor(app: ExternalApp) {
	if (nonEditorSet.has(app)) return;

	const row = localDb.select().from(settings).get();
	if (!row?.defaultEditor) {
		localDb
			.insert(settings)
			.values({ id: 1, defaultEditor: app })
			.onConflictDoUpdate({
				target: settings.id,
				set: { defaultEditor: app },
			})
			.run();
	}
}

/** Resolves the default editor from project setting, then global setting. */
export function resolveDefaultEditor(projectId?: string): ExternalApp | null {
	if (projectId) {
		const project = localDb
			.select()
			.from(projects)
			.where(eq(projects.id, projectId))
			.get();
		if (project?.defaultApp) return project.defaultApp;
	}
	const row = localDb.select().from(settings).get();
	return row?.defaultEditor ?? null;
}

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
				await openPathInApp(input.path, input.app);

				// Persist defaults only after successful launch
				if (input.projectId) {
					localDb
						.update(projects)
						.set({ defaultApp: input.app })
						.where(eq(projects.id, input.projectId))
						.run();
				}

				// Auto-set global default editor on first successful use (best-effort)
				try {
					ensureGlobalDefaultEditor(input.app);
				} catch (err) {
					console.warn(
						"[external/openInApp] Failed to persist global default editor:",
						err,
					);
				}
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
				// Preserve first-run behavior for terminal/file-link flows.
				// If no project/global default editor is configured yet, fall back to Cursor.
				const app = resolveDefaultEditor(input.projectId) ?? "cursor";

				await openPathInApp(filePath, app);
			}),
	});
};

export type ExternalRouter = ReturnType<typeof createExternalRouter>;
