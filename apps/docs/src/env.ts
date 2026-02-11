import { createEnv } from "@t3-oss/env-nextjs";
import { vercel } from "@t3-oss/env-nextjs/presets-zod";
import { z } from "zod";

export const env = createEnv({
	extends: [vercel()],
	shared: {
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
	},

	server: {
		STRIPE_SECRET_KEY: z.string().optional(),
		STRIPE_WEBHOOK_SECRET: z.string().optional(),
		STRIPE_PRO_MONTHLY_PRICE_ID: z.string().optional(),
		STRIPE_PRO_YEARLY_PRICE_ID: z.string().optional(),
		SLACK_BILLING_WEBHOOK_URL: z.string().url(),
		SENTRY_AUTH_TOKEN: z.string().optional(),
	},

	client: {
		NEXT_PUBLIC_MARKETING_URL: z.string().url().optional(),
		NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
		NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
		NEXT_PUBLIC_SENTRY_DSN_DOCS: z.string().optional(),
		NEXT_PUBLIC_SENTRY_ENVIRONMENT: z
			.enum(["development", "preview", "production"])
			.optional(),
	},

	experimental__runtimeEnv: {
		NODE_ENV: process.env.NODE_ENV,
		NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL,
		NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
		NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
		NEXT_PUBLIC_SENTRY_DSN_DOCS: process.env.NEXT_PUBLIC_SENTRY_DSN_DOCS,
		NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
	},

	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
