import type { AppRouter } from "@superset/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { env } from "main/env.main";
import superjson from "superjson";
import { authService } from "./auth";

/**
 * tRPC client for calling the Superset API
 * Automatically includes the access token in requests
 */
export const apiClient = createTRPCClient<AppRouter>({
	links: [
		httpBatchLink({
			url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
			transformer: superjson,
			async headers() {
				const token = await authService.getAccessToken();
				if (token) {
					return {
						Authorization: `Bearer ${token}`,
					};
				}
				return {};
			},
		}),
	],
});
