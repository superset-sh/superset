import type { AppRouter } from "@superset/trpc";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { getAuthToken } from "./auth-client";

/** Base API URL without trailing slash (avoid importing `env` here — breaks circular init in tests). */
function getApiTrpcBaseUrl(): string {
	const u = process.env.NEXT_PUBLIC_API_URL;
	if (typeof u === "string" && u.length > 0) {
		return u.replace(/\/$/, "");
	}
	return "https://api.superset.sh";
}

/**
 * HTTP tRPC client for calling the API server.
 * Uses bearer token authentication like the auth client.
 * For mutations only - for fetching data we already have electric
 */
export const apiTrpcClient = createTRPCProxyClient<AppRouter>({
	links: [
		httpBatchLink({
			url: `${getApiTrpcBaseUrl()}/api/trpc`,
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
		}),
	],
});
