import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string(),
		DATABASE_URL_UNPOOLED: z.string(),
		CLERK_SECRET_KEY: z.string(),
		ELECTRIC_URL: z.string().url(),
		ELECTRIC_SECRET: z.string().min(16),
		BLOB_READ_WRITE_TOKEN: z.string(),
		DESKTOP_AUTH_SECRET: z.string().min(32),
		GOOGLE_CLIENT_ID: z.string().min(1),
		GOOGLE_CLIENT_SECRET: z.string().min(1),
		GH_CLIENT_ID: z.string().min(1),
		GH_CLIENT_SECRET: z.string().min(1),
		LINEAR_CLIENT_ID: z.string().min(1),
		LINEAR_CLIENT_SECRET: z.string().min(1),
		LINEAR_WEBHOOK_SECRET: z.string().min(1),
		QSTASH_TOKEN: z.string().min(1),
		QSTASH_CURRENT_SIGNING_KEY: z.string().min(1),
		QSTASH_NEXT_SIGNING_KEY: z.string().min(1),
		SENTRY_AUTH_TOKEN: z.string().optional(),
	},
	client: {
		NEXT_PUBLIC_API_URL: z.string().url(),
		NEXT_PUBLIC_WEB_URL: z.string().url(),
		NEXT_PUBLIC_ADMIN_URL: z.string().url(),
		NEXT_PUBLIC_SENTRY_DSN_API: z.string().optional(),
		NEXT_PUBLIC_SENTRY_ENVIRONMENT: z
			.enum(["development", "preview", "production"])
			.optional(),
	},
	experimental__runtimeEnv: {
		NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
		NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
		NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
		NEXT_PUBLIC_SENTRY_DSN_API: process.env.NEXT_PUBLIC_SENTRY_DSN_API,
		NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
	},
	emptyStringAsUndefined: true,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
