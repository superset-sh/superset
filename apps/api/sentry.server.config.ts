import * as Sentry from "@sentry/nextjs";

import { env } from "@/env";

Sentry.init({
	dsn: env.NEXT_PUBLIC_SENTRY_DSN_API,
	environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
	enabled: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT === "production",
	// No tracesSampleRate or tracesSampler on purpose: the SDK treats a rate of
	// 0 as "tracing on, sample nothing" and still records every span whose
	// parent was sampled, and a sampler here was storing a flat 5% of ~20M
	// requests a day (~19M spans, 115x the org quota). Omitting both disables
	// spans outright.
	sendDefaultPii: true,
	debug: false,
});
