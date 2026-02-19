/**
 * Environment variables safe for SHARED CODE (main + renderer).
 *
 * This file only accesses individual process.env properties that are:
 * 1. Defined in Vite's `define` block (replaced at build time for renderer)
 * 2. Available in main process via actual process.env
 *
 * DO NOT spread ...process.env here - that only works in main process.
 *
 * For main-process-only env vars (API URLs, etc.), use src/main/env.main.ts
 * For renderer-only env vars (PostHog, etc.), use src/renderer/env.renderer.ts
 */
import { z } from "zod/v4";

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	// Port env vars (set in root .env or written by setup.sh for inner worktrees)
	DESKTOP_VITE_PORT: z.coerce.number().default(5173),
	DESKTOP_NOTIFICATIONS_PORT: z.coerce.number().default(51741),
	ELECTRIC_PORT: z.coerce.number().default(5133),
	DESKTOP_AUTOMATION_PORT: z.coerce.number().default(41729),
	// Workspace name for instance isolation
	SUPERSET_WORKSPACE_NAME: z.string().default("superset"),
});

/**
 * Shared environment variables.
 *
 * These work in both main and renderer because Vite's `define` replaces
 * process.env.NODE_ENV at build time for renderer, while main process
 * reads the actual value at runtime.
 */
export const env = envSchema.parse({
	NODE_ENV: process.env.NODE_ENV,
	DESKTOP_VITE_PORT: process.env.DESKTOP_VITE_PORT,
	DESKTOP_NOTIFICATIONS_PORT: process.env.DESKTOP_NOTIFICATIONS_PORT,
	ELECTRIC_PORT: process.env.ELECTRIC_PORT,
	DESKTOP_AUTOMATION_PORT: process.env.DESKTOP_AUTOMATION_PORT,
	SUPERSET_WORKSPACE_NAME: process.env.SUPERSET_WORKSPACE_NAME,
});

export function getWorkspaceName(): string | undefined {
	const name = env.SUPERSET_WORKSPACE_NAME;
	if (name === "superset") return undefined;
	return name
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, "-")
		.slice(0, 32);
}
