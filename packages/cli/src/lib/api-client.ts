import { ORGANIZATION_HEADER } from "@superset/shared/constants";
import type { AppRouter } from "@superset/trpc";
import type { TRPCClient } from "@trpc/client";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";
import { getApiUrl } from "./config";

export type ApiClient = TRPCClient<AppRouter>;

export function createApiClient(opts: {
	bearer: string;
	organizationId?: string;
}): ApiClient {
	return createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${getApiUrl()}/api/trpc`,
				transformer: SuperJSON,
				headers() {
					const headers: Record<string, string> = {
						Authorization: `Bearer ${opts.bearer}`,
					};
					if (opts.organizationId) {
						headers[ORGANIZATION_HEADER] = opts.organizationId;
					}
					return headers;
				},
			}),
		],
	});
}
