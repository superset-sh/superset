import type { AppRouter } from "@superset/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { env } from "@/env";

export const REVALIDATE_SECONDS = 300;

/**
 * Anonymous reader for `leaderboard.public.*`. tRPC sends queries as GET, so the
 * URLs stay stable and cacheable by the CDN; the `next` option makes the ISR
 * pages revalidate on the same window and is ignored in the browser.
 */
export const leaderboardClient = createTRPCClient<AppRouter>({
	links: [
		httpBatchLink({
			url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
			transformer: superjson,
			fetch: (url, options) =>
				fetch(url, { ...options, next: { revalidate: REVALIDATE_SECONDS } }),
		}),
	],
});

/**
 * Signed-in reader for `leaderboard.viewer`. The session cookie is scoped to the
 * parent domain (`crossSubDomainCookies` in packages/auth), and the API allows
 * the marketing origin with `Access-Control-Allow-Credentials`, so the browser
 * carries the cookie to the API on its own — the same thing apps/web does. No
 * `next` option here: this response is per-user and must never be cached.
 */
export const viewerClient = createTRPCClient<AppRouter>({
	links: [
		httpBatchLink({
			url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
			transformer: superjson,
			fetch: (url, options) =>
				fetch(url, { ...options, credentials: "include", cache: "no-store" }),
		}),
	],
});
