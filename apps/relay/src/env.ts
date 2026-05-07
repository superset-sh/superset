import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		RELAY_PORT: z.coerce.number().int().positive().default(8080),
		NEXT_PUBLIC_API_URL: z.url(),
		KV_REST_API_URL: z.url(),
		KV_REST_API_TOKEN: z.string().min(1),
		FLY_REGION: z.string().default("local"),
		FLY_MACHINE_ID: z.string().default("local"),
		RELAY_SENTRY_DSN: z.string().url().optional(),
		RELAY_SYNTHETIC_JWT: z.string().min(1).optional(),
		RELAY_PUBLIC_URL: z.url().default("https://relay.superset.sh"),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
