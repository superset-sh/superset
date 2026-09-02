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
