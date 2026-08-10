import * as Sentry from "@sentry/nextjs";

import { env } from "@/env";

Sentry.init({
	dsn: env.NEXT_PUBLIC_SENTRY_DSN_ADMIN,
	environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
	enabled: !!env.NEXT_PUBLIC_SENTRY_DSN_ADMIN,
	tracesSampleRate: 0.05,
	sendDefaultPii: true,
	debug: false,
});
