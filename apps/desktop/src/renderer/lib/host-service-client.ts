import type { AppRouter } from "@superset/host-service";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

const clientCache = new Map<
	string,
	ReturnType<typeof createTRPCClient<AppRouter>>
>();

export type HostServiceClient = ReturnType<typeof createTRPCClient<AppRouter>>;

export function getHostServiceClient(
	port: number,
	sessionToken?: string | null,
): HostServiceClient {
	return getHostServiceClientByUrl(
		`http://127.0.0.1:${port}`,
		sessionToken ?? undefined,
	);
}

export function getHostServiceClientByUrl(
	hostUrl: string,
	sessionToken?: string,
): HostServiceClient {
	const cacheKey = sessionToken ? `${hostUrl}:${sessionToken}` : hostUrl;
	const cached = clientCache.get(cacheKey);
	if (cached) return cached;

	const client = createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${hostUrl}/trpc`,
				transformer: superjson,
				headers: () => {
					// Send session token for authentication
					if (sessionToken) {
						return {
							Authorization: `Bearer ${sessionToken}`,
						};
					}
					return {};
				},
			}),
		],
	});

	clientCache.set(cacheKey, client);
	return client;
}
