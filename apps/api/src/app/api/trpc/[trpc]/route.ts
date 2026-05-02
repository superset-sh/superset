import { appRouter } from "@superset/trpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "@/trpc/context";

export const maxDuration = 60;

/** tRPC error codes that represent expected auth failures, not bugs. */
const AUTH_ERROR_CODES = new Set(["UNAUTHORIZED", "FORBIDDEN"]);

const handler = (req: Request) =>
	fetchRequestHandler({
		endpoint: "/api/trpc",
		req,
		router: appRouter,
		createContext,
		onError: ({ path, error }) => {
			if (AUTH_ERROR_CODES.has(error.code)) {
				console.warn(`⚠ tRPC auth on ${path ?? "<no-path>"}: ${error.message}`);
			} else {
				console.error(`❌ tRPC error on ${path ?? "<no-path>"}:`, error);
			}
		},
	});

export { handler as GET, handler as POST };
