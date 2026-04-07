import type { AppRouter } from "@superset/trpc";
import type { TRPCClient } from "@trpc/client";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";
import { getApiUrl, type SupersetConfig } from "./config";

export type ApiClient = TRPCClient<AppRouter>;

export function createApiClient(config: SupersetConfig): ApiClient {
	const token = config.auth?.accessToken;
	return createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${getApiUrl(config)}/api/trpc`,
				transformer: SuperJSON,
				headers() {
					return token ? { Authorization: `Bearer ${token}` } : {};
				},
			}),
		],
	});
}
