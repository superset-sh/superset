import "../../../scripts/test-preload.ts";

process.env.SKIP_ENV_VALIDATION = "1";
// Importing @superset/auth/stripe or @superset/db/client constructs a client,
// which throws without these. Neither connects until it is used.
process.env.STRIPE_SECRET_KEY ??= "sk_test_placeholder";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.DATABASE_URL_UNPOOLED ??= process.env.DATABASE_URL;
