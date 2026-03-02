import type { AppRouter } from "@superset/trpc";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { authClient } from "../auth/client";
import { env } from "../env";

export const apiClient = createTRPCProxyClient<AppRouter>({
	links: [
		httpBatchLink({
			url: `${env.EXPO_PUBLIC_API_URL}/api/trpc`,
			headers() {
				const cookies = authClient.getCookie();
				return cookies ? { Cookie: cookies } : {};
			},
			transformer: superjson,
		}),
	],
});
