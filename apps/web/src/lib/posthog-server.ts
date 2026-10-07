import { createOptionalAnalytics } from "@superset/shared/optional-analytics";
import { PostHog } from "posthog-node";

import { env } from "@/env";

// One server-side client for the whole app. flushAt: 1 / flushInterval: 0 because
// serverless functions are short-lived and would otherwise drop buffered events.
export const posthogServer = createOptionalAnalytics(
	env.NEXT_PUBLIC_POSTHOG_KEY,
	(key) =>
		new PostHog(key, {
			host: env.NEXT_PUBLIC_POSTHOG_HOST,
			flushAt: 1,
			flushInterval: 0,
		}),
);
