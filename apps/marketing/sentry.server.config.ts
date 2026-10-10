import * as Sentry from "@sentry/nextjs";
import { sazabiIntegration } from "@superset/shared/sentry-sazabi";

import { env } from "@/env";

Sentry.init({
	dsn: env.NEXT_PUBLIC_SENTRY_DSN_MARKETING,
	environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
	enabled: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT === "production",
	sendDefaultPii: true,
	integrations: [
		sazabiIntegration({
			dsn: env.NEXT_PUBLIC_SAZABI_SENTRY_DSN,
			transport: Sentry.makeNodeTransport,
		}),
	],
	debug: false,
});
