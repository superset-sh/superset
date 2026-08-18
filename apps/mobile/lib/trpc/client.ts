import type { AppRouter } from "@superset/trpc";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import * as Application from "expo-application";
import superjson from "superjson";
import { authClient, getJwt } from "../auth/client";
import { env } from "../env";

const clientVersionHeader = `mobile/${Application.nativeApplicationVersion ?? "0.0.0"}`;

export const apiClient = createTRPCProxyClient<AppRouter>({
	links: [
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
