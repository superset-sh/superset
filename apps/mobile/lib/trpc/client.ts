import type { AppRouter } from "@superset/trpc";
import { createTRPCProxyClient, httpBatchLink, retryLink } from "@trpc/client";
import * as Application from "expo-application";
import superjson from "superjson";
import { authClient, getJwt } from "../auth/client";
import { env } from "../env";
import { isTransportError } from "../errors";

const clientVersionHeader = `mobile/${Application.nativeApplicationVersion ?? "0.0.0"}`;

export const apiClient = createTRPCProxyClient<AppRouter>({
	links: [
		// iOS drops pooled HTTPS connections that have gone idle, and
		// Apple's guidance for the -1005 that produces is to retry rather
		// than surface it (QA1941). A phone in a pocket hits this on the
		// first tap after every idle stretch.
		//
		// Queries only. A mutation is not safe to replay here: when the
		// caller does not supply a branch, `workspaces.create` picks a
		// fresh friendly-random name per call and dedupes on the branch,
		// not on the client-minted id — so a replayed create would land a
		// second workspace instead of resolving to the first.
		retryLink({
			retry: ({ op, error, attempts }) =>
				attempts === 1 && op.type === "query" && isTransportError(error),
		}),
		httpBatchLink({
			url: `${env.EXPO_PUBLIC_API_URL}/api/trpc`,
			headers() {
				const cookies = authClient.getCookie();
				const jwt = getJwt();
				return {
					"x-superset-client": clientVersionHeader,
					...(cookies ? { Cookie: cookies } : {}),
					...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
				};
			},
			transformer: superjson,
		}),
	],
});
