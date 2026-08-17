import { randomBytes } from "node:crypto";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		HOST_SERVICE_SECRET: z
			.string()
			.min(1)
			.default(randomBytes(32).toString("hex")),
		ORGANIZATION_ID: z.string().uuid(),
		HOST_DB_PATH: z.string().min(1),
		HOST_MIGRATIONS_FOLDER: z.string().min(1),
		AUTH_TOKEN: z.string().min(1),
		SUPERSET_AUTH_CONFIG_PATH: z.string().min(1).optional(),
		SUPERSET_API_URL: z.string().url(),
		CORS_ORIGINS: z
			.string()
			.transform((s) => s.split(",").map((o) => o.trim()))
			.optional(),
		PORT: z.coerce.number().int().positive().default(4879),
		RELAY_URL: z.string().url().optional(),
		// Loopback control surface for the desktop's in-app browser panes. Only
		// set when a desktop app spawned this host; absent on standalone hosts.
		BROWSER_BRIDGE_URL: z.string().url().optional(),
		BROWSER_BRIDGE_SECRET: z.string().min(1).optional(),
		/**
		 * "sandbox" when running inside a cloud sandbox. A sandbox is reached
		 * directly at its provider preview URL, so it must not register as a
		 * host or hold a relay socket — that would put it in the device picker
		 * and keep it awake against the provider's wake-on-inbound sleep.
		 */
		SUPERSET_HOST_RUN_MODE: z.enum(["local", "sandbox"]).default("local"),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
