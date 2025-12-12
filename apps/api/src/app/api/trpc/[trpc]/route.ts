import { appRouter, createTRPCContext } from "@superset/trpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

const handler = (req: Request) =>
	fetchRequestHandler({
		endpoint: "/api/trpc",
		req,
		router: appRouter,
		createContext: () => createTRPCContext({ headers: req.headers }),
		onError: ({ path, error }) => {
			console.error(`❌ tRPC error on ${path ?? "<no-path>"}:`, error);
		},
	});

// Preflight requests - CORS headers added by next.config.ts
export const OPTIONS = () => new Response(null, { status: 204 });

export { handler as GET, handler as POST };
