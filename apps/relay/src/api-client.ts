import type { AppRouter } from "@superset/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";

export function createApiClient(token: string, apiUrl: string) {
	return createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${apiUrl}/api/trpc`,
				transformer: SuperJSON,
				headers: () => ({ Authorization: `Bearer ${token}` }),
			}),
		],
	});
}
