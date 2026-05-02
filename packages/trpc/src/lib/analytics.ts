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

/**
 * Reads `x-superset-client: <surface>@<version>` from request headers and
 * returns flat properties to spread into a posthog.capture properties object.
 * Returns nullable values when the header is missing or malformed so the
 * properties always exist on the event (queryable as null).
 */
export function parseClientHeader(headers: Headers): {
	client: string | null;
	client_version: string | null;
} {
	const raw = headers.get("x-superset-client")?.trim();
	if (!raw) return { client: null, client_version: null };
	const at = raw.lastIndexOf("@");
	if (at <= 0) return { client: raw, client_version: null };
	return {
		client: raw.slice(0, at),
		client_version: raw.slice(at + 1) || null,
	};
}
