import { appRouter, createTRPCContext } from "@superset/api";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { NextRequest } from "next/server";

const setCorsHeaders = (res: Response) => {
	res.headers.set("Access-Control-Allow-Origin", "*");
	res.headers.set("Access-Control-Request-Method", "*");
	res.headers.set("Access-Control-Allow-Methods", "OPTIONS, GET, POST");
	res.headers.set("Access-Control-Allow-Headers", "*");
	return res;
};

export const OPTIONS = () => {
	return setCorsHeaders(new Response(null, { status: 204 }));
};

const handler = async (req: NextRequest) => {
	const response = await fetchRequestHandler({
		endpoint: "/api/trpc",
		router: appRouter,
		req,
		createContext: () =>
			createTRPCContext({
				headers: req.headers,
			}),
		onError({ error, path }) {
			console.error(`[TRPC Error] ${path ?? "<no-path>"}:`, error);
		},
	});

	return setCorsHeaders(response);
};

export { handler as GET, handler as POST };
