import type { AppRouter } from "@superset/trpc";
import { INTERNAL_READ_HEADER } from "@superset/trpc/leaderboard-schema";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { env } from "@/env";

export const REVALIDATE_SECONDS = 300;

/**
 * Server-side reads only; the browser sends nothing extra. The token exempts
 * our own renders from the API's per-IP anonymous limiter, which sees every
 * marketing render behind Vercel's shared egress address as one visitor. The
 * build id is part of Next's data-cache key, and the data cache outlives a
 * deploy while the response shape does not: without it a new build reads the
 * previous build's cached responses once per handle before revalidating.
 */
function serverReadHeaders(): Record<string, string> {
	if (typeof window !== "undefined") return {};
	const headers: Record<string, string> = {};
	if (
		env.LEADERBOARD_INTERNAL_TOKEN &&
		isPrivateTransport(env.NEXT_PUBLIC_API_URL)
	) {
		headers[INTERNAL_READ_HEADER] = env.LEADERBOARD_INTERNAL_TOKEN;
	}
	if (env.VERCEL_GIT_COMMIT_SHA) {
		headers["x-superset-build"] = env.VERCEL_GIT_COMMIT_SHA;
	}
	return headers;
}

// The token travels in a custom header, which fetch keeps on a cross-origin
// redirect, so it only goes over TLS or to a loopback dev server.
function isPrivateTransport(apiUrl: string): boolean {
	const { protocol, hostname } = new URL(apiUrl);
	return (
		protocol === "https:" ||
		hostname === "localhost" ||
		hostname === "127.0.0.1"
	);
}

/**
 * Reader for `leaderboard.public.*`. tRPC sends queries as GET, so the URLs
 * stay stable and cacheable by the CDN; the `next` option makes the ISR pages
 * revalidate on the same window and is ignored in the browser. Server-side
 * reads refuse redirects: our own API never redirects a tRPC GET, and
 * following one would carry the internal token to wherever it pointed.
 */
export const leaderboardClient = createTRPCClient<AppRouter>({
	links: [
		httpBatchLink({
			url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
			transformer: superjson,
			headers: serverReadHeaders,
			fetch: (url, options) =>
				fetch(url, {
					...options,
					...(typeof window === "undefined" ? { redirect: "error" } : {}),
					next: { revalidate: REVALIDATE_SECONDS },
				}),
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
