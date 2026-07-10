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
					// better-auth's apiKey plugin reads `sk_live_…` from the
					// x-api-key header. The Authorization: Bearer header is
					// for OAuth/JWT tokens only — sending an api key there
					// gets rejected as an invalid bearer.
					const headers: Record<string, string> = opts.bearer.startsWith(
						"sk_live_",
					)
						? { "x-api-key": opts.bearer }
						: { Authorization: `Bearer ${opts.bearer}` };
					if (opts.organizationId) {
						headers[ORGANIZATION_HEADER] = opts.organizationId;
					}
					return headers;
				},
			}),
		],
	});
}
