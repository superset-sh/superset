import * as Sentry from "@sentry/nextjs";

import { env } from "@/env";

Sentry.init({
	dsn: env.NEXT_PUBLIC_SENTRY_DSN_MARKETING,
	environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
	enabled: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT === "production",
	tracesSampleRate:
		env.NEXT_PUBLIC_SENTRY_ENVIRONMENT === "production" ? 0.1 : 1.0,
	sendDefaultPii: true,
	debug: false,
	beforeSend(event) {
		// Drop expected session fetch failures — visitors often have stale/invalid cookies
		// and the marketing site doesn't require authentication (MARKETING-17)
		if (
			event.exception?.values?.some(
				(e) =>
					e.type === "APIError" && e.value?.includes("Failed to get session"),
			)
		) {
			return null;
		}
		return event;
	},
});
