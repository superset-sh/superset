import { createOptionalAnalytics } from "@superset/shared/optional-analytics";
import { PostHog } from "posthog-node";

import { env } from "../env";

// Singleton — every server-side capture in this package goes through it.
// flushAt: 1, flushInterval: 0 mirrors packages/trpc and apps/api so events
// survive short-lived processes (Vercel functions, edge handlers). The request
// timeout is bounded because this client is awaited inside request handlers
// (signup, Stripe webhooks) where a slow PostHog must not stall the caller.
export const posthog = createOptionalAnalytics(
	env.NEXT_PUBLIC_POSTHOG_KEY,
	(key) =>
		new PostHog(key, {
			host: env.NEXT_PUBLIC_POSTHOG_HOST,
			flushAt: 1,
			flushInterval: 0,
			requestTimeout: 3000,
		}),
);
