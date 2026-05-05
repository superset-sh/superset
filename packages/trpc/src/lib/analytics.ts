import { PostHog } from "posthog-node";
import { env } from "../env";

// Singleton — all server-side product event captures go through this client.
// flushAt: 1, flushInterval: 0 mirrors apps/api/src/lib/analytics.ts so we
// don't lose events on short-lived processes (Vercel functions, edge handlers).
export const posthog = new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
	host: env.NEXT_PUBLIC_POSTHOG_HOST,
	flushAt: 1,
	flushInterval: 0,
});
