import type { AppRouter } from "@superset/trpc";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import { env } from "renderer/env.renderer";
import superjson from "superjson";
import { getCloudRequestHeaders } from "./cloudRequestContext";

/**
 * Imperative tRPC client for the API server (bearer-token auth). For
 * component data fetching use the `cloudTrpc` React Query hooks instead.
 */
export const apiTrpcClient = createTRPCProxyClient<AppRouter>({
	links: [
		httpBatchLink({
			url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
			transformer: superjson,
			headers: getCloudRequestHeaders,
		}),
	],
});
