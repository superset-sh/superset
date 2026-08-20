import { z } from "zod";

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	EXPO_PUBLIC_API_URL: z.url(),
	EXPO_PUBLIC_RELAY_URL: z.url(),
	EXPO_PUBLIC_WEB_URL: z.url().default("https://app.superset.sh"),
	EXPO_PUBLIC_DEEP_LINK_SCHEME: z.string().default("superset"),
	EXPO_PUBLIC_DEEP_LINK_DOMAIN: z.string().optional(),
	EXPO_PUBLIC_POSTHOG_KEY: z.string(),
	EXPO_PUBLIC_POSTHOG_HOST: z.url().default("https://us.i.posthog.com"),
	EXPO_PUBLIC_SENTRY_DSN_MOBILE: z.url().optional(),
	EXPO_PUBLIC_SENTRY_ENVIRONMENT: z.string().default("production"),
	EXPO_PUBLIC_E2E: z.string().optional(),
});

const rawEnv: Record<string, string | undefined> = {
	NODE_ENV: process.env.NODE_ENV,
	EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
	EXPO_PUBLIC_RELAY_URL: process.env.EXPO_PUBLIC_RELAY_URL,
	EXPO_PUBLIC_WEB_URL: process.env.EXPO_PUBLIC_WEB_URL,
	EXPO_PUBLIC_DEEP_LINK_SCHEME: process.env.EXPO_PUBLIC_DEEP_LINK_SCHEME,
	EXPO_PUBLIC_DEEP_LINK_DOMAIN: process.env.EXPO_PUBLIC_DEEP_LINK_DOMAIN,
	EXPO_PUBLIC_POSTHOG_KEY: process.env.EXPO_PUBLIC_POSTHOG_KEY,
	EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST,
	EXPO_PUBLIC_SENTRY_DSN_MOBILE: process.env.EXPO_PUBLIC_SENTRY_DSN_MOBILE,
	EXPO_PUBLIC_SENTRY_ENVIRONMENT: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT,
	EXPO_PUBLIC_E2E: process.env.EXPO_PUBLIC_E2E,
};

export const env = envSchema.parse(
	Object.fromEntries(
		Object.entries(rawEnv).map(([key, value]) => [
			key,
			value === "" ? undefined : value,
		]),
	),
);
