import type { AppRouter } from "@superset/host-service";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { getHostServiceHeaders } from "./host-service-auth";

const MAX_CLIENT_CACHE_SIZE = 10;
const clientCache = new Map<
	string,
	ReturnType<typeof createTRPCClient<AppRouter>>
>();

export type HostServiceClient = ReturnType<typeof createTRPCClient<AppRouter>>;

export function getHostServiceClient(port: number): HostServiceClient {
	return getHostServiceClientByUrl(`http://127.0.0.1:${port}`);
}

export function getHostServiceClientByUrl(hostUrl: string): HostServiceClient {
	const cached = clientCache.get(hostUrl);
	if (cached) return cached;

	const client = createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${hostUrl}/trpc`,
				transformer: superjson,
				headers: () => getHostServiceHeaders(hostUrl),
			}),
		],
	});

	clientCache.set(hostUrl, client);
	// Evict oldest entries to prevent unbounded cache growth from port recycling
	if (clientCache.size > MAX_CLIENT_CACHE_SIZE) {
		const oldest = clientCache.keys().next().value;
		if (oldest !== undefined && oldest !== hostUrl) {
			clientCache.delete(oldest);
		}
	}
	return client;
}
