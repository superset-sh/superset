import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { createContext } from "@/trpc/context";
import { appRouter } from "@superset/trpc";

const handler = (req: Request) =>
	fetchRequestHandler({
		endpoint: "/api/trpc",
		req,
		router: appRouter,
		createContext,
		onError: ({ path, error }) => {
			console.error(`❌ tRPC error on ${path ?? "<no-path>"}:`, error);
		},
	});

export const OPTIONS = () => new Response(null, { status: 204 });

export { handler as GET, handler as POST };
