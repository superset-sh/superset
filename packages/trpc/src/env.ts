import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		BLOB_READ_WRITE_TOKEN: z.string().min(1),
		// Cloudflare: R2 holds page bytes and chat attachments, and the
		// usercontent origin serves pages from it. Optional so a checkout
		// without them still boots; the storage call is what fails.
		CLOUDFLARE_ACCOUNT_ID: z.string().min(1).optional(),
		R2_ACCESS_KEY_ID: z.string().min(1).optional(),
		R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
		R2_PRIVATE_BUCKET: z.string().min(1).optional(),
		// Endpoint override for S3-compatible emulators (MinIO) in tests/dev.
		R2_ENDPOINT: z.string().url().optional(),
		USERCONTENT_URL: z.string().url().optional(),
		MEDIA_URL: z.string().url().optional(),
		USERCONTENT_TOKEN_SECRET: z.string().min(32).optional(),
		// Optional: page thumbnails are skipped wherever this is unset.
		CLOUDFLARE_BROWSER_RENDERING_TOKEN: z.string().min(1).optional(),
		POSTHOG_API_KEY: z.string(),
		POSTHOG_API_HOST: z.string().url().default("https://us.posthog.com"),
		POSTHOG_PROJECT_ID: z.string(),
		NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1),
		NEXT_PUBLIC_POSTHOG_HOST: z
			.string()
			.url()
			.default("https://us.i.posthog.com"),
		QSTASH_TOKEN: z.string().min(1),
		QSTASH_CURRENT_SIGNING_KEY: z.string().min(1),
		QSTASH_NEXT_SIGNING_KEY: z.string().min(1),
		RESEND_API_KEY: z.string().min(1),
		NEXT_PUBLIC_API_URL: z.string().url(),
		NEXT_PUBLIC_WEB_URL: z.string().url(),
		KV_REST_API_URL: z.string().url().optional(),
		KV_REST_API_TOKEN: z.string().optional(),
		// Blaxel (cloud workspace sandboxes).
		BLAXEL_API_KEY: z.string().min(1),
		BLAXEL_WORKSPACE: z.string().min(1),
		BLAXEL_REGION: z.string().min(1),
		BLAXEL_SANDBOX_IMAGE: z.string().min(1),
		// GitHub App credentials
		GH_APP_ID: z.string().min(1),
		GH_APP_PRIVATE_KEY: z.string().min(1),
		GH_WEBHOOK_SECRET: z.string().min(1),
		ANTHROPIC_API_KEY: z.string(),
		OPENAI_API_KEY: z.string().min(1),
		RELAY_URL: z.string().url(),
		LINEAR_CLIENT_ID: z.string().min(1),
		LINEAR_CLIENT_SECRET: z.string().min(1),
		GOOGLE_CLIENT_ID: z.string().min(1),
		GOOGLE_CLIENT_SECRET: z.string().min(1),
		SENTRY_CLIENT_ID: z.string().optional(),
		SENTRY_CLIENT_SECRET: z.string().optional(),
		// Optional: the Teams integration is off wherever these are unset, and
		// every other environment keeps booting.
		MICROSOFT_CLIENT_ID: z.string().min(1).optional(),
		MICROSOFT_CLIENT_SECRET: z.string().min(1).optional(),
		STRIPE_SECRET_KEY: z.string().optional(),
		MERCURY_API_TOKEN: z.string().optional(),
	},
	clientPrefix: "PUBLIC_",
	client: {},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
