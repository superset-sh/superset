import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		BLOB_READ_WRITE_TOKEN: z.string().min(1),
		POSTHOG_API_KEY: z.string(),
		POSTHOG_API_HOST: z.string().url().default("https://us.posthog.com"),
		POSTHOG_PROJECT_ID: z.string(),
		QSTASH_TOKEN: z.string().min(1),
		QSTASH_CURRENT_SIGNING_KEY: z.string().min(1),
		QSTASH_NEXT_SIGNING_KEY: z.string().min(1),
		NEXT_PUBLIC_API_URL: z.string().url(),
		NEXT_PUBLIC_WEB_URL: z.string().url(),
		KV_REST_API_URL: z.string().url().optional(),
		KV_REST_API_TOKEN: z.string().optional(),
		// GitHub App credentials
		GH_APP_ID: z.string().min(1),
		GH_APP_PRIVATE_KEY: z.string().min(1),
		GH_WEBHOOK_SECRET: z.string().min(1),
		SECRETS_ENCRYPTION_KEY: z.string().min(1),
		ANTHROPIC_API_KEY: z.string(),
	},
	clientPrefix: "PUBLIC_",
	client: {},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
