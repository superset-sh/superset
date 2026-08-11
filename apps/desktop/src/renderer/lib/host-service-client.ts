import type { AppRouter } from "@superset/host-service";
import { createTRPCClient, httpBatchStreamLink } from "@trpc/client";
import superjson from "superjson";
import { getHostServiceHeaders } from "./host-service-auth";

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
			// Streaming batch link: same-tick calls share one HTTP request and
			// one CORS preflight, but each result streams as soon as it's ready
			// — no slowest-in-batch latency (the reason #3879 unbatched the old
			// buffering httpBatchLink). All renderer clients share Chromium's
			// 6-connections-per-origin pool with every other host-service
			// request, so sockets are the scarce resource here.
			httpBatchStreamLink({
				url: `${hostUrl}/trpc`,
				transformer: superjson,
				headers: () => getHostServiceHeaders(hostUrl),
			}),
		],
	});

	clientCache.set(hostUrl, client);
	return client;
}
