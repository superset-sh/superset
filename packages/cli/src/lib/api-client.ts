import type { AppRouter } from "@superset/trpc";
import type { TRPCClient } from "@trpc/client";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";
import { getApiUrl, type SupersetConfig } from "./config";

export type ApiClient = TRPCClient<AppRouter>;

export function createApiClient(
	config: SupersetConfig,
	opts: { bearer: string },
): ApiClient {
	return createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${getApiUrl(config)}/api/trpc`,
				transformer: SuperJSON,
				headers() {
					return opts.bearer.startsWith("sk_live_")
						? { "x-api-key": opts.bearer }
						: { Authorization: `Bearer ${opts.bearer}` };
				},
			}),
		],
	});
}
