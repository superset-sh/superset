import * as Sentry from "@sentry/nextjs";

import { env } from "@/env";

Sentry.init({
	dsn: env.NEXT_PUBLIC_SENTRY_DSN_API,
	environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
	enabled: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT === "production",
	// Time-boxed: measuring what moving the database into the functions' region
	// bought. Remove this sampler and go back to omitting both keys once the
	// after-numbers are in — a flat rate here is what cost 115x the org quota
	// in September, and every route not named below still returns 0.
	//
	// Three routes, chosen to answer one question each, at ~81k spans/day:
	//   desktop/version  one query per request and nothing else, so its p50 is
	//                    the round trip itself. 72ms before.
	//   trpc GET         the volume case: 5.8 queries a request, 436ms before,
	//                    of which ~389ms was wire.
	//   gmail/push       the worst case at 11.2 queries a request, 3445ms.
	tracesSampler: ({ name }) => {
		if (name.includes("/api/desktop/version")) return 0.01;
		if (name.includes("/api/integrations/google/gmail/push")) return 0.25;
		if (name.includes("/api/trpc/")) return 0.00025;
		return 0;
	},
	sendDefaultPii: true,
	debug: false,
});
