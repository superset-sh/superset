import { appRouter } from "@superset/trpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "@/trpc/context";

const LEADERBOARD_CACHE_SECONDS = 300;
const STATS_CACHE_SECONDS = 3600;

export const maxDuration = 60;

const handler = (req: Request) =>
	fetchRequestHandler({
		endpoint: "/api/trpc",
		req,
		router: appRouter,
		createContext,
		// Anonymous leaderboard reads are the only cacheable surface here; every
		// other procedure varies by session. Cache only when *every* path in the
		// batch is under leaderboard.public, or a session-varying response gets
		// served from the CDN to the next caller.
		responseMeta: ({ paths, type, errors }) => {
			if (type !== "query" || errors.length > 0 || !paths?.length) return {};
			if (!paths.every((path) => path.startsWith("leaderboard.public."))) {
				return {};
			}
			const maxAge = paths.every((path) => path === "leaderboard.public.stats")
				? STATS_CACHE_SECONDS
				: LEADERBOARD_CACHE_SECONDS;
			return {
				headers: {
					"cache-control": `public, s-maxage=${maxAge}, stale-while-revalidate=86400`,
					vary: "origin",
				},
			};
		},
		onError: ({ path, error }) => {
			// Suppress NOT_FOUND for the known-dead device.heartbeat path (removed in
			// #4490, old desktop clients gated behind UpdateRequiredPage still call
			// it) and for public profile lookups, where an unknown handle is normal
			// crawler traffic. All other NOT_FOUND errors should remain visible.
			if (
				error.code === "NOT_FOUND" &&
				(path === "device.heartbeat" ||
					path === "leaderboard.public.participant")
			) {
				return;
			}
			console.error(`❌ tRPC error on ${path ?? "<no-path>"}:`, error);
		},
	});

export { handler as GET, handler as POST };
