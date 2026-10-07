import path from "node:path";
import { billingEnvValue } from "@superset/shared/billing-env";
import { redisUrl } from "@superset/shared/redis-url";
import { createEnv } from "@t3-oss/env-core";
import { config } from "dotenv";
import { z } from "zod";

config({ path: path.resolve(process.cwd(), "../../../.env"), quiet: true });

export const env = createEnv({
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
		GH_CLIENT_ID: z.string(),
		GH_CLIENT_SECRET: z.string(),
		GOOGLE_CLIENT_ID: z.string(),
		GOOGLE_CLIENT_SECRET: z.string(),
		APPLE_CLIENT_ID: z.string().default("sh.superset.mobile"),
		APPLE_CLIENT_SECRET: z.string().default(""),
		APPLE_APP_BUNDLE_IDENTIFIER: z.string().default("sh.superset.mobile"),
		AUTHENTIK_ISSUER: z.string().url().optional(),
		AUTHENTIK_CLIENT_ID: z.string().optional(),
		AUTHENTIK_CLIENT_SECRET: z.string().optional(),
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
		STRIPE_ENTERPRISE_YEARLY_PRICE_ID: billingEnvValue(
			process.env.STRIPE_SECRET_KEY,
		),
		QSTASH_TOKEN:
			process.env.SELF_HOST_QUEUE === "1"
				? z.string().optional()
				: z.string().min(1),
		SLACK_BILLING_WEBHOOK_URL: z.string().url(),
	},
	clientPrefix: "NEXT_PUBLIC_",
	client: {
		NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
		NEXT_PUBLIC_POSTHOG_HOST: z
			.string()
			.url()
			.default("https://us.i.posthog.com"),
		NEXT_PUBLIC_COOKIE_DOMAIN: z.string(),
		NEXT_PUBLIC_API_URL: z.string().url(),
		NEXT_PUBLIC_WEB_URL: z.string().url(),
		NEXT_PUBLIC_ADMIN_URL: z.string().url(),
		NEXT_PUBLIC_MARKETING_URL: z.string().url(),
		NEXT_PUBLIC_DESKTOP_URL: z.string().url().optional(),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
	skipValidation: true,
});
