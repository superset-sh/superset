import { billingEnvValue } from "@superset/shared/billing-env";
import { redisUrl } from "@superset/shared/redis-url";
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
		SELF_HOST_QUEUE: z.preprocess(
			(value) => (value === "" ? undefined : value),
			z.enum(["0", "1"]).default("0"),
		),
		SELF_HOST_QUEUE_URL: z.preprocess(
			(value) => (value === "" ? undefined : value),
			z
				.string()
				.url()
				.refine((value) => {
					const url = new URL(value);
					return (
						["http:", "https:"].includes(url.protocol) &&
						!url.username &&
						!url.password &&
						url.pathname === "/" &&
						!url.search &&
						!url.hash
					);
				}, "Queue URL must be an HTTP(S) origin")
				.default("http://127.0.0.1:8789"),
		),
		SELF_HOST_QUEUE_SECRET: z.preprocess(
			(value) => (value === "" ? undefined : value),
			process.env.SELF_HOST_QUEUE === "1"
				? z.string().min(32)
				: z.string().min(32).optional(),
		),
		DATABASE_URL: z.string().url(),
		DATABASE_URL_UNPOOLED: z.string().url(),
		BETTER_AUTH_SECRET: z.string(),
		SMTP_URL: z.preprocess(
			(value) => (value === "" ? undefined : value),
			z
				.string()
				.url()
				.regex(/^smtps?:\/\//)
				.optional(),
		),
		EMAIL_FROM: z.preprocess(
			(value) => (value === "" ? undefined : value),
			z.string().optional(),
		),
		RESEND_API_KEY: process.env.SMTP_URL ? z.string().optional() : z.string(),
		SELF_HOST_KV: z.enum(["0", "1"]).default("0"),
		REDIS_URL: redisUrl.default("redis://127.0.0.1:6379"),
		KV_REST_API_URL:
			process.env.SELF_HOST_KV === "1" ? z.string().optional() : z.string(),
		KV_REST_API_TOKEN:
			process.env.SELF_HOST_KV === "1" ? z.string().optional() : z.string(),
		STRIPE_SECRET_KEY: billingEnvValue(process.env.STRIPE_SECRET_KEY),
		STRIPE_WEBHOOK_SECRET: billingEnvValue(process.env.STRIPE_SECRET_KEY),
		STRIPE_PRO_MONTHLY_PRICE_ID: billingEnvValue(process.env.STRIPE_SECRET_KEY),
		STRIPE_PRO_YEARLY_PRICE_ID: billingEnvValue(process.env.STRIPE_SECRET_KEY),
		SLACK_BILLING_WEBHOOK_URL: z.string().url(),
		SENTRY_AUTH_TOKEN: z.string().optional(),
		SERVER_ANTHROPIC_API_KEY: z.string().min(1),
	},

	client: {
		NEXT_PUBLIC_API_URL: z.string().url(),
		NEXT_PUBLIC_WEB_URL: z.string().url(),
		NEXT_PUBLIC_COOKIE_DOMAIN: z.string(),
		NEXT_PUBLIC_POSTHOG_KEY: z.string(),
		NEXT_PUBLIC_POSTHOG_HOST: z.string().url(),
		NEXT_PUBLIC_SENTRY_DSN_ADMIN: z.string().optional(),
		NEXT_PUBLIC_SENTRY_ENVIRONMENT: z
			.enum(["development", "preview", "production"])
			.optional(),
	},

	experimental__runtimeEnv: {
		NODE_ENV: process.env.NODE_ENV,
		NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
		NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
		NEXT_PUBLIC_COOKIE_DOMAIN: process.env.NEXT_PUBLIC_COOKIE_DOMAIN,
		NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
		NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
		NEXT_PUBLIC_SENTRY_DSN_ADMIN: process.env.NEXT_PUBLIC_SENTRY_DSN_ADMIN,
		NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
	},

	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
