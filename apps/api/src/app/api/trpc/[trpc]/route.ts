import { appRouter } from "@superset/trpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "@/trpc/context";

export const maxDuration = 60;

const handler = (req: Request) =>
	fetchRequestHandler({
		endpoint: "/api/trpc",
		req,
		router: appRouter,
		createContext,
		onError: ({ path, error }) => {
			// Suppress NOT_FOUND only for the known-dead device.heartbeat path
			// (removed in #4490). Old desktop clients gated behind UpdateRequiredPage
			// still call it; all other NOT_FOUND errors should remain visible.
			if (error.code === "NOT_FOUND" && path === "device.heartbeat") return;
			console.error(`❌ tRPC error on ${path ?? "<no-path>"}:`, error);
		},
	});

export { handler as GET, handler as POST };
