import type { AppRouter } from "@superset/trpc";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import { env } from "renderer/env.renderer";
import superjson from "superjson";
import { getAuthToken } from "./auth-client";

/**
 * In local-only mode, return a valid tRPC batch response
 * so no real HTTP requests are made.
 */
const mockTrpcFetch: typeof fetch = async (_url, init) => {
	const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
	const batchSize = Object.keys(body).length || 1;
	const results = Array.from({ length: batchSize }, () => ({
		result: { data: { json: null } },
	}));
	return new Response(JSON.stringify(results), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
};

/**
 * HTTP tRPC client for calling the API server.
 * Uses bearer token authentication like the auth client.
 * For mutations only - for fetching data we already have electric
 */
export const apiTrpcClient = createTRPCProxyClient<AppRouter>({
	links: [
		httpBatchLink({
			url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
			transformer: superjson,
			...(env.SKIP_ENV_VALIDATION ? { fetch: mockTrpcFetch } : {}),
			headers: () => {
				const token = getAuthToken();
				if (token) {
					return {
						Authorization: `Bearer ${token}`,
					};
				}
				return {};
			},
		}),
	],
});
