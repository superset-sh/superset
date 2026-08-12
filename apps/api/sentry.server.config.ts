import * as Sentry from "@sentry/nextjs";

import { env } from "@/env";

Sentry.init({
	dsn: env.NEXT_PUBLIC_SENTRY_DSN_API,
	environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
	enabled: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT === "production",
	// Per-route sampling. /api/auth/* is session/JWT polling from every
	// client — 87% of api traffic (~600M req/30d) with no diagnostic value,
	// and at 10% it alone blew the span quota 16x. Webhooks/jobs are low
	// volume and each trace is useful; the rest gets a working sample.
	tracesSampler: ({ name }) => {
		if (name.includes("/api/auth/")) return 0;
		if (name.includes("/webhook") || name.includes("/jobs/")) return 0.25;
		return 0.05;
	},
	sendDefaultPii: true,
	debug: false,
});
