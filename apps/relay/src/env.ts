import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		RELAY_PORT: z.coerce.number().int().positive().default(8080),
		// Cap on any single proxied host request. Worktree creation on large
		// repos can exceed the old hardcoded 30s; callers (automations,
		// factory) time out client-side at 90s.
		RELAY_TUNNEL_REQUEST_TIMEOUT_MS: z.coerce
			.number()
			.int()
			.positive()
			.default(30_000),
		NEXT_PUBLIC_API_URL: z.url(),
		KV_REST_API_URL: z.url(),
		KV_REST_API_TOKEN: z.string().min(1),
		FLY_REGION: z.string().default("local"),
		FLY_MACHINE_ID: z.string().default("local"),
		// Fly sets this automatically; used to build `<machine>.vm.<app>.internal`
		// addresses for relay-to-relay WebSocket proxying across instances.
		FLY_APP_NAME: z.string().default("local"),
		RELAY_SYNTHETIC_JWT: z.string().min(1).optional(),
		RELAY_PUBLIC_URL: z.url().default("https://relay.superset.sh"),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
