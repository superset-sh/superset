import type { AppRouter } from "@superset/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";
import { env } from "./env";

export function createApiClient(token: string) {
	return createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
				transformer: SuperJSON,
				headers: () => ({ Authorization: `Bearer ${token}` }),
			}),
		],
	});
}
