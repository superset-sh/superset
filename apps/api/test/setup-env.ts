import "../../../scripts/test-preload.ts";

process.env.SKIP_ENV_VALIDATION = "1";
// Importing a module that constructs a client throws without these. None
// connects until it is used.
process.env.STRIPE_SECRET_KEY ??= "sk_test_placeholder";
process.env.RESEND_API_KEY ??= "re_placeholder";
process.env.NEXT_PUBLIC_POSTHOG_KEY ??= "phc_placeholder";
// @superset/email validates this at import and has no opt-out.
process.env.NEXT_PUBLIC_MARKETING_URL ??= "https://marketing.test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.DATABASE_URL_UNPOOLED ??= process.env.DATABASE_URL;

// apps/api reads `env` once at import, so the values tests assert on are fixed
// here and not left to a developer's shell or .env.
Object.assign(process.env, {
	BETTER_AUTH_SECRET: "test-secret",
	LINEAR_WEBHOOK_SECRET: "test-secret",
	NEXT_PUBLIC_API_URL: "https://api.test",
	NEXT_PUBLIC_WEB_URL: "https://app.superset.sh",
	QSTASH_TOKEN: "qstash-token",
	SERVER_ANTHROPIC_API_KEY: "test",
	SLACK_SIGNING_SECRET: "test-secret",
});
