import type { AppRouter } from "@superset/trpc";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import { env } from "renderer/env.renderer";
import superjson from "superjson";
import { apiTrpc } from "./api-trpc";
import { getAuthToken } from "./auth-client";

/**
 * Shared httpBatchLink configuration for API server communication.
 */
const apiLink = httpBatchLink({
	url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
	transformer: superjson,
	headers: () => {
		const token = getAuthToken();
		if (token) {
			return {
				Authorization: `Bearer ${token}`,
			};
		}
		return {};
	},
});

/**
 * HTTP tRPC proxy client for calling the API server.
 * Uses bearer token authentication.
 * For imperative calls from stores/utilities.
 */
export const apiTrpcClient = createTRPCProxyClient<AppRouter>({
	links: [apiLink],
});

/**
 * HTTP tRPC React client for calling the API server.
 * Uses bearer token authentication.
 * For React Query hooks (used by ApiTRPCProvider).
 */
export const apiReactClient = apiTrpc.createClient({
	links: [apiLink],
});
