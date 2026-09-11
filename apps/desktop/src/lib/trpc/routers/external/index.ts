import fs from "node:fs";
import nodePath from "node:path";
import {
	EXTERNAL_APPS,
	NON_EDITOR_APPS,
	projects,
	settings,
} from "@superset/local-db";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { app, clipboard, shell } from "electron";
import { localDb } from "main/lib/local-db";
import { externalUrlLogLabel, isSafeExternalUrl } from "main/lib/safe-url";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { getWorkspace } from "../workspaces/utils/db-helpers";
import { getWorkspacePath } from "../workspaces/utils/worktree";
import {
	type ExternalApp,
	getAppCommand,
	openFolderInFileBrowser,
	pathIsMissing,
	RelativePathWithoutCwdError,
	resolvePath,
	spawnAsync,
} from "./helpers";

/**
 * Wraps a tRPC handler so a `RelativePathWithoutCwdError` (thrown by
 * `resolvePath` when a relative path arrives without a `worktreePath`)
 * surfaces as a clear BAD_REQUEST with the root-cause message instead
 * of a generic 500.
 */
async function withResolveGuard<T>(fn: () => Promise<T> | T): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof RelativePathWithoutCwdError) {
			throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
		}
		throw err;
	}
}

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
	// Paths reach here from terminal links, diff rows and workspace rows, any
	// of which can name something an agent has since deleted or a worktree that
	// has been removed. Whether it is still there is ours to answer, so answer
	// it before handing the path to another program: otherwise the miss comes
	// back as an opaque non-zero exit (macOS `open` writes "The file <path>
	// does not exist"), which we can only report as a 500 (DESKTOP-15).
	if (await pathIsMissing(filePath)) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "This file no longer exists.",
		});
	}

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
 * Fallback for openFileInEditor when no editor is configured. The path may be
 * untrusted (a Cmd+clicked terminal link), so it must open as a *document*:
 * `shell.openPath` hands it to the OS default handler, which for `.command`,
 * `.sh`, an executable, or an app bundle means running it. macOS `open -t`
 * asks the default text editor instead; folders go through the bundle guard.
 */
async function openInDefaultEditor(filePath: string): Promise<void> {
	let isDirectory: boolean;
	try {
		isDirectory = (await fs.promises.stat(filePath)).isDirectory();
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "ENOENT" || code === "ENOTDIR") {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "This file no longer exists.",
			});
		}
		throw error;
	}
	if (isDirectory) {
		await openFolderInFileBrowser(filePath, (path) => shell.openPath(path));
		return;
	}
	if (process.platform === "darwin") {
		await spawnAsync("open", ["-t", filePath]);
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
			if (!isSafeExternalUrl(input)) {
				console.warn(
					"[external/openUrl] Blocked unsafe URL scheme:",
					externalUrlLogLabel(input),
				);
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "URL scheme not allowed",
				});
			}
			try {
				await shell.openExternal(input);
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				console.error(
					"[external/openUrl] Failed to open URL:",
					externalUrlLogLabel(input),
					error,
				);
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

		// Opens a folder itself in Finder (like `open <path>`), rather than
		// highlighting it in its parent the way openInFinder does.
		openFolderInFinder: publicProcedure
			.input(z.string())
			.mutation(async ({ input }) => {
				if (!nodePath.isAbsolute(input)) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `openFolderInFinder requires an absolute path (got ${JSON.stringify(input)}).`,
					});
				}
				await openFolderInFileBrowser(input, (path) => shell.openPath(path));
			}),

		saveToDownloads: publicProcedure
			.input(
				z.object({
					filename: z.string().min(1),
					// ~10MB attachment cap → ~14M base64 chars; reject anything wilder.
					dataBase64: z.string().max(20_000_000),
				}),
			)
			.mutation(async ({ input }) => {
				const safeName = nodePath.basename(input.filename) || "download";
				const downloadsDir = app.getPath("downloads");
				const { name, ext } = nodePath.parse(safeName);
				let target = nodePath.join(downloadsDir, safeName);
				for (let i = 1; fs.existsSync(target); i++) {
					target = nodePath.join(downloadsDir, `${name} (${i})${ext}`);
				}
				await fs.promises.writeFile(
					target,
					Buffer.from(input.dataBase64, "base64"),
				);
				return { path: target };
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
				// openInApp hands `path` directly to the editor CLI / shell; with no
				// cwd input there's no safe way to interpret a relative path, so we
				// reject them loudly instead of silently resolving against Electron's
				// working directory.
				if (!nodePath.isAbsolute(input.path)) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `openInApp requires an absolute path (got ${JSON.stringify(input.path)}).`,
					});
				}
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

		copyText: publicProcedure.input(z.string()).mutation(async ({ input }) => {
			clipboard.writeText(input);
		}),

		resolvePath: publicProcedure
			.input(
				z.object({
					path: z.string(),
					/** Absolute workspace worktree path — relative `path`s are resolved against this. */
					worktreePath: z.string().optional(),
				}),
			)
			.query(({ input }) =>
				withResolveGuard(() => resolvePath(input.path, input.worktreePath)),
			),

		statPath: publicProcedure
			.input(
				z.object({
					path: z.string(),
					workspaceId: z.string().optional(),
				}),
			)
			.mutation(({ input }) =>
				withResolveGuard(async () => {
					const workspace = input.workspaceId
						? getWorkspace(input.workspaceId)
						: null;
					const cwd = workspace
						? (getWorkspacePath(workspace) ?? undefined)
						: undefined;
					const resolved = resolvePath(input.path, cwd);
					try {
						const stats = await fs.promises.stat(resolved);
						return {
							isDirectory: stats.isDirectory(),
							resolvedPath: resolved,
						};
					} catch {
						return null;
					}
				}),
			),

		openFileInEditor: publicProcedure
			.input(
				z.object({
					path: z.string(),
					line: z.number().optional(),
					column: z.number().optional(),
					/**
					 * Absolute workspace worktree path. Required when `path` is
					 * relative; ignored when `path` is already absolute. Using the
					 * workspace's worktreePath (rather than an arbitrary cwd) means
					 * relative diff/tree paths always resolve against the workspace
					 * the user is in, never Electron's process cwd.
					 */
					worktreePath: z.string().optional(),
					projectId: z.string().optional(),
					/**
					 * Explicit app override from the caller (e.g. the v2 CMD+O
					 * choice stored client-side in tanstack-db). When provided,
					 * bypasses the server-side `resolveDefaultEditor` lookup —
					 * which only knows about v1 localDb tables and would
					 * otherwise return a stale global default for v2 projects.
					 */
					app: ExternalAppSchema.optional(),
				}),
			)
			.mutation(({ input }) =>
				withResolveGuard(async () => {
					const filePath = resolvePath(input.path, input.worktreePath);
					const app = input.app ?? resolveDefaultEditor(input.projectId);

					if (!app) {
						// No preferred editor configured yet: fall back to the OS
						// default text editor so Cmd/Ctrl+click still works even when
						// Cursor (or any specific editor) isn't installed.
						await openInDefaultEditor(filePath);
						return;
					}

					await openPathInApp(filePath, app);
				}),
			),
	});
};

export type ExternalRouter = ReturnType<typeof createExternalRouter>;
