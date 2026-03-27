import type { AppRouter } from "@superset/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";
import type { ApiAuthProvider } from "../../providers/auth";
import type { ApiClient } from "../../types";

export function createApiClient(
	baseUrl: string,
	authProvider: ApiAuthProvider,
): ApiClient {
	return createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${baseUrl}/api/trpc`,
				transformer: SuperJSON,
				async headers() {
					return authProvider.getHeaders();
				},
			}),
		],
	});
}
