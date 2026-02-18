import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	shared: {
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
	},
	server: {
		DATABASE_URL: z.string(),
		DATABASE_URL_UNPOOLED: z.string(),
		ELECTRIC_URL: z.string().url(),
		ELECTRIC_SECRET: z.string().min(16),
		ELECTRIC_SOURCE_ID: z.string().optional(),
		ELECTRIC_SOURCE_SECRET: z.string().optional(),
		BLOB_READ_WRITE_TOKEN: z.string(),
		GOOGLE_CLIENT_ID: z.string().min(1),
		GOOGLE_CLIENT_SECRET: z.string().min(1),
		GH_CLIENT_ID: z.string().min(1),
		GH_CLIENT_SECRET: z.string().min(1),
		BETTER_AUTH_SECRET: z.string(),
		LINEAR_CLIENT_ID: z.string().min(1),
		LINEAR_CLIENT_SECRET: z.string().min(1),
		LINEAR_WEBHOOK_SECRET: z.string().min(1),
		GH_APP_ID: z.string().min(1),
		GH_APP_PRIVATE_KEY: z.string().min(1),
		GH_WEBHOOK_SECRET: z.string().min(1),
		SLACK_CLIENT_ID: z.string().min(1),
		SLACK_CLIENT_SECRET: z.string().min(1),
		SLACK_SIGNING_SECRET: z.string(),
		ANTHROPIC_API_KEY: z.string(),
		QSTASH_TOKEN: z.string().min(1),
		QSTASH_CURRENT_SIGNING_KEY: z.string().min(1),
		QSTASH_NEXT_SIGNING_KEY: z.string().min(1),
		RESEND_API_KEY: z.string(),
		KV_REST_API_URL: z.string(),
		KV_REST_API_TOKEN: z.string(),
		KV_URL: z.string().url(),
		STRIPE_SECRET_KEY: z.string(),
		STRIPE_WEBHOOK_SECRET: z.string(),
		STRIPE_PRO_MONTHLY_PRICE_ID: z.string(),
		STRIPE_PRO_YEARLY_PRICE_ID: z.string(),
		SLACK_BILLING_WEBHOOK_URL: z.string().url(),
		SECRETS_ENCRYPTION_KEY: z.string().min(1),
		SENTRY_AUTH_TOKEN: z.string().optional(),
	},
	client: {
		NEXT_PUBLIC_API_URL: z.string().url(),
		NEXT_PUBLIC_WEB_URL: z.string().url(),
		NEXT_PUBLIC_ADMIN_URL: z.string().url(),
		NEXT_PUBLIC_DESKTOP_URL: z.string().url().optional(),
		NEXT_PUBLIC_SENTRY_DSN_API: z.string().optional(),
		NEXT_PUBLIC_SENTRY_ENVIRONMENT: z
			.enum(["development", "preview", "production"])
			.optional(),
	},
	experimental__runtimeEnv: {
		NODE_ENV: process.env.NODE_ENV,
		NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
		NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
		NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
		NEXT_PUBLIC_DESKTOP_URL: process.env.NEXT_PUBLIC_DESKTOP_URL,
		NEXT_PUBLIC_SENTRY_DSN_API: process.env.NEXT_PUBLIC_SENTRY_DSN_API,
		NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
	},
	emptyStringAsUndefined: true,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
