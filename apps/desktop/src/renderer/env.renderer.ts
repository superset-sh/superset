/**
 * Environment variables for the RENDERER PROCESS (browser context).
 *
 * These values are injected at BUILD TIME by Vite's `define` in electron.vite.config.ts.
 * They are NOT read from process.env at runtime - Vite replaces the references with
 * literal strings during compilation.
 *
 * Only import this file in src/renderer/ code - never in main or shared code.
 *
 * For main process env vars, use src/main/env.main.ts instead.
 */
import { z } from "zod/v4";

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	NEXT_PUBLIC_API_URL: z.url().default("https://api.superset.sh"),
	NEXT_PUBLIC_WEB_URL: z.url().default("https://app.superset.sh"),
	NEXT_PUBLIC_ELECTRIC_URL: z
		.url()
		.default("https://api.superset.sh/api/electric"),
	NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
	NEXT_PUBLIC_POSTHOG_HOST: z.string().default("https://us.i.posthog.com"),
	SENTRY_DSN_DESKTOP: z.string().optional(),
});

/**
 * Build-time environment variables.
 *
 * Vite replaces these process.env.* and import.meta.env.* references at build time.
 * The values are baked into the bundle as string literals.
 */
const rawEnv = {
	// These are replaced by Vite's define at build time
	NODE_ENV: process.env.NODE_ENV,
	NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
	NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
	NEXT_PUBLIC_ELECTRIC_URL: process.env.NEXT_PUBLIC_ELECTRIC_URL,
	NEXT_PUBLIC_POSTHOG_KEY: import.meta.env.NEXT_PUBLIC_POSTHOG_KEY as
		| string
		| undefined,
	NEXT_PUBLIC_POSTHOG_HOST: import.meta.env.NEXT_PUBLIC_POSTHOG_HOST as
		| string
		| undefined,
	SENTRY_DSN_DESKTOP: import.meta.env.SENTRY_DSN_DESKTOP as string | undefined,
};

// Only allow skipping validation in development (never in production)
const SKIP_ENV_VALIDATION =
	process.env.NODE_ENV === "development" && !!process.env.SKIP_ENV_VALIDATION;

export const env = {
	...(SKIP_ENV_VALIDATION
		? (rawEnv as z.infer<typeof envSchema>)
		: envSchema.parse(rawEnv)),
	SKIP_ENV_VALIDATION,
};
