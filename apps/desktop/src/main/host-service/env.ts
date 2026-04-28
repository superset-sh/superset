import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		AUTH_TOKEN: z.string().min(1),
		CLOUD_API_URL: z.string().url(),
		HOST_DB_PATH: z.string().min(1),
		HOST_MIGRATIONS_FOLDER: z.string().min(1),
		HOST_SERVICE_SECRET: z.string().min(1),
		HOST_SERVICE_PORT: z.coerce.number().int().positive(),
		ORGANIZATION_ID: z.string().min(1),
		DESKTOP_VITE_PORT: z.coerce.number().int().positive(),
		RELAY_URL: z.string().url().optional(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		SENTRY_DSN_HOST_SERVICE: z.string().url().optional(),
		SENTRY_RELEASE: z.string().optional(),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
