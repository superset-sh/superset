import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		// Cloudflare: R2 holds page bytes, chat attachments, avatars and
		// organization logos, and the usercontent origin serves them. Required,
		// so a deployment missing one fails at boot rather than at the first
		// upload — `.env.local.example` carries fake values that boot fine.
		CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
		R2_ACCESS_KEY_ID: z.string().min(1),
		R2_SECRET_ACCESS_KEY: z.string().min(1),
		R2_PRIVATE_BUCKET: z.string().min(1),
		// Avatars and organization logos: world-readable by design, served
		// straight from the bucket's custom domain with no ticket. Required,
		// unlike the private bucket above: every avatar upload needs it, so a
		// deployment missing it should fail at boot rather than at the first
		// upload.
		R2_PUBLIC_BUCKET: z.string().min(1),
		// Set explicitly rather than derived from the account id: a
		// jurisdiction-restricted bucket carries a region label the derived
		// form would miss, and pointing this at localhost is how the storage
		// path is exercised against an S3-compatible emulator in tests/dev.
		R2_ENDPOINT: z.string().url(),
		USERCONTENT_URL: z.string().url(),
		STATIC_URL: z.string().url(),
		USERCONTENT_TOKEN_SECRET: z.string().min(32),
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
		// Shared with apps/marketing. Its server-side leaderboard reads present
		// it to skip the per-IP anonymous limiter, which would otherwise count
		// every marketing render as one visitor (Vercel shares egress IPs).
		// Absent means every read is anonymous and rate-limited.
		LEADERBOARD_INTERNAL_TOKEN: z.string().min(1).optional(),
		// Vercel Sandbox (cloud workspace sandboxes). A token for the team's
		// `sandboxes` project, not the deploy token.
		VERCEL_SANDBOX_TOKEN: z.string().min(1),
		VERCEL_SANDBOX_TEAM_ID: z.string().min(1),
		VERCEL_SANDBOX_PROJECT_ID: z.string().min(1),
		VERCEL_SANDBOX_REGION: z.string().min(1).default("iad1"),
		// Shared with the sandbox edge Worker: signs the tickets clients present
		// there and derives the secret each sandbox's host-service is booted with.
		SANDBOX_EDGE_SECRET: z.string().min(32),
		// The edge with `*` where a workspace's `<id>-<port>` label goes, e.g.
		// https://*.sandbox.supersetusercontent.com; a local wrangler dev has no `*`.
		SANDBOX_EDGE_ORIGIN: z
			.string()
			.url()
			.or(z.string().regex(/^https?:\/\/\*\./)),
		SENTRY_DSN_SANDBOX: z.string().optional(),
		NEXT_PUBLIC_SENTRY_ENVIRONMENT: z
			.enum(["development", "preview", "production"])
			.optional(),
		SECRETS_ENCRYPTION_KEY: z.string().optional(),
		// GitHub App credentials
		GH_APP_ID: z.string().min(1),
		GH_APP_PRIVATE_KEY: z.string().min(1),
		GH_WEBHOOK_SECRET: z.string().min(1),
		ANTHROPIC_API_KEY: z.string(),
		OPENAI_API_KEY: z.string().min(1),
		RELAY_URL: z.string().url().default("https://relay.superset.sh"),
		REALTIME_URL: z.string().url().default("https://realtime.superset.sh"),
		REALTIME_NUDGE_SECRET: z.string().min(1),
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
		// Optional read-only PAT (no scopes needed), shared with apps/marketing.
		// GitHub's stargazers endpoint requires authentication even for public
		// repos; without it the star history tiles report "not available" and
		// every other growth tile keeps working.
		GITHUB_TOKEN: z.string().min(1).optional(),
		// Optional: the admin Growth page's Search Console tiles report "not
		// connected" wherever the service account is unset. The account must be
		// added as a user of the property in Search Console.
		GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT: z.string().min(1).optional(),
		GOOGLE_SEARCH_CONSOLE_SITE_URL: z
			.string()
			.min(1)
			.default("sc-domain:superset.sh"),
	},
	clientPrefix: "PUBLIC_",
	client: {},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
