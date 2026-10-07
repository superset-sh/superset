import { createOptionalAnalytics } from "@superset/shared/optional-analytics";
import { PostHog } from "posthog-node";
import { env } from "@/env";

export const posthog = createOptionalAnalytics(
	env.NEXT_PUBLIC_POSTHOG_KEY,
	(key) =>
		new PostHog(key, {
			host: env.NEXT_PUBLIC_POSTHOG_HOST,
			flushAt: 1,
			flushInterval: 0,
		}),
);
