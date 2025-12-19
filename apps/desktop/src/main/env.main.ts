/**
 * Environment variables for the MAIN PROCESS (Node.js context).
 *
 * This file uses t3-env with process.env which works at runtime in Node.js.
 * Only import this file in src/main/ code - never in renderer or shared code.
 *
 * For renderer process env vars, use src/renderer/env.renderer.ts instead.
 */
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

export const env = createEnv({
	server: {
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		NEXT_PUBLIC_API_URL: z.url().default("https://api.superset.sh"),
		NEXT_PUBLIC_WEB_URL: z.url().default("https://app.superset.sh"),
		GOOGLE_CLIENT_ID: z.string().min(1),
		GH_CLIENT_ID: z.string().min(1),
	},

	runtimeEnv: {
		...process.env,
		NODE_ENV: process.env.NODE_ENV,
	},
	emptyStringAsUndefined: true,

	// Main process runs in trusted Node.js environment
	isServer: true,
});
