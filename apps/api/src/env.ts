import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string(),
		DATABASE_URL_UNPOOLED: z.string(),
		// Auth0 env vars are read directly by @auth0/nextjs-auth0:
		// AUTH0_SECRET, AUTH0_BASE_URL, AUTH0_ISSUER_BASE_URL, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET
		BLOB_READ_WRITE_TOKEN: z.string(),
	},
	client: {
		NEXT_PUBLIC_WEB_URL: z.string().url(),
		NEXT_PUBLIC_ADMIN_URL: z.string().url(),
	},
	experimental__runtimeEnv: {
		NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
		NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
	},
	emptyStringAsUndefined: true,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
