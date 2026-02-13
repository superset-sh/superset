import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";
import type { AppRouter } from "../root";

export function createServerTRPCClient({
	apiUrl,
	headers,
}: {
	apiUrl: string;
	headers: Headers;
}) {
	return createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				transformer: SuperJSON,
				url: `${apiUrl}/api/trpc`,
				headers() {
					return Object.fromEntries(headers.entries());
				},
			}),
		],
	});
}
