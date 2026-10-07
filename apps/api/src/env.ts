import { billingEnvValue } from "@superset/shared/billing-env";
import { redisUrl } from "@superset/shared/redis-url";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
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
		DATABASE_URL: z.string(),
		DATABASE_URL_UNPOOLED: z.string(),
		GOOGLE_CLIENT_ID: z.string().min(1),
		GOOGLE_CLIENT_SECRET: z.string().min(1),
		GH_CLIENT_ID: z.string().min(1),
		GH_CLIENT_SECRET: z.string().min(1),
		// Gmail push: the Pub/Sub topic `users.watch` publishes to, and the
		// shared secret the push subscription appends to our URL. Absent means
		// Gmail triggers are configured but never watched.
		GOOGLE_PUBSUB_TOPIC: z.string().min(1).optional(),
		GOOGLE_PUBSUB_PUSH_TOKEN: z.string().min(1).optional(),
		// Static bearer token for the read-only support account lookup; the
		// endpoint answers 404 while unset.
		SUPPORT_LOOKUP_TOKEN: z.string().regex(/^\S+$/).optional(),
		BETTER_AUTH_SECRET: z.string(),
		LINEAR_CLIENT_ID: z.string().min(1),
		LINEAR_CLIENT_SECRET: z.string().min(1),
		LINEAR_WEBHOOK_SECRET: z.string().min(1),
		// Optional until the Notion integration is provisioned per environment;
		// the Notion routes answer 503 while any of these is unset.
		NOTION_CLIENT_ID: z.string().min(1).optional(),
		NOTION_CLIENT_SECRET: z.string().min(1).optional(),
		// The verification token Notion sends when the webhook subscription is
		// created; it is also the HMAC key every later delivery is signed with.
		NOTION_WEBHOOK_VERIFICATION_TOKEN: z.string().min(1).optional(),
		GH_APP_SLUG: z.string().min(1),
		GH_APP_ID: z.string().min(1),
		GH_APP_PRIVATE_KEY: z.string().min(1),
		GH_WEBHOOK_SECRET: z.string().min(1),
		SLACK_CLIENT_ID: z.string().min(1),
		SLACK_CLIENT_SECRET: z.string().min(1),
		SLACK_SIGNING_SECRET: z.string(),
		// Optional: the Teams integration is off wherever these are unset, and
		// every other environment keeps booting.
		MICROSOFT_CLIENT_ID: z.string().min(1).optional(),
		MICROSOFT_CLIENT_SECRET: z.string().min(1).optional(),
		SERVER_ANTHROPIC_API_KEY: z.string().min(1),
		QSTASH_TOKEN:
			process.env.SELF_HOST_QUEUE === "1"
				? z.string().optional()
				: z.string().min(1),
		QSTASH_URL:
			process.env.SELF_HOST_QUEUE === "1"
				? z.string().optional()
				: z.string().url(),
		QSTASH_CURRENT_SIGNING_KEY:
			process.env.SELF_HOST_QUEUE === "1"
				? z.string().optional()
				: z.string().min(1),
		QSTASH_NEXT_SIGNING_KEY:
			process.env.SELF_HOST_QUEUE === "1"
				? z.string().optional()
				: z.string().min(1),
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
		KV_URL: z.string().url(),
		STRIPE_SECRET_KEY: billingEnvValue(process.env.STRIPE_SECRET_KEY),
		STRIPE_WEBHOOK_SECRET: billingEnvValue(process.env.STRIPE_SECRET_KEY),
		STRIPE_PRO_MONTHLY_PRICE_ID: billingEnvValue(process.env.STRIPE_SECRET_KEY),
		STRIPE_PRO_YEARLY_PRICE_ID: billingEnvValue(process.env.STRIPE_SECRET_KEY),
		// YC Bookface deal redemption webhook (deal 13843). The route answers
		// 503 while the secret is unset. The secret lives on the Bookface deal
		// edit page, under the webhook documentation.
		YC_DEALS_WEBHOOK_SECRET: z.string().min(1).optional(),
		YC_BOOKFACE_DEAL_ID: z.coerce.number().default(13843),
		YC_BOOKFACE_COUPON_ID: z.string().min(1).default("yc-bookface-6mo"),
		SLACK_BILLING_WEBHOOK_URL: z.string().url(),
		SENTRY_AUTH_TOKEN: z.string().optional(),
		// Public Sentry integration (OAuth app). Optional: unset where the app
		// is not registered yet, in which case the connect flow 400s.
		SENTRY_CLIENT_ID: z.string().optional(),
		SENTRY_CLIENT_SECRET: z.string().optional(),
		// The published app's slug, used to build the install URL.
		SENTRY_APP_SLUG: z.string().optional(),
		RELAY_URL: z.string().url().default("https://relay.superset.sh"),
		REALTIME_URL: z.string().url().default("https://realtime.superset.sh"),
	},
	client: {
		NEXT_PUBLIC_API_URL: z.string().url(),
		NEXT_PUBLIC_WEB_URL: z.string().url(),
		NEXT_PUBLIC_ADMIN_URL: z.string().url(),
		NEXT_PUBLIC_MARKETING_URL: z.string().url(),
		NEXT_PUBLIC_DESKTOP_URL: z.string().url().optional(),
		NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
		NEXT_PUBLIC_POSTHOG_HOST: z
			.string()
			.url()
			.default("https://us.i.posthog.com"),
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
		NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL,
		NEXT_PUBLIC_DESKTOP_URL: process.env.NEXT_PUBLIC_DESKTOP_URL,
		NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
		NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
		NEXT_PUBLIC_SENTRY_DSN_API: process.env.NEXT_PUBLIC_SENTRY_DSN_API,
		NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
	},
	emptyStringAsUndefined: true,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
