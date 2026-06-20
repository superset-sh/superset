import { EXTERNAL_APPS } from "@superset/local-db";
import { z } from "zod";

export const ExternalAppSchema = z.enum(EXTERNAL_APPS);

export const openFileInEditorInputSchema = z.object({
	path: z.string(),
	line: z.number().int().min(1).optional(),
	column: z.number().int().min(1).optional(),
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
});
