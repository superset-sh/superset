import type { AppRouter } from "@superset/host-service";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

const clientCache = new Map<
	number,
	ReturnType<typeof createTRPCClient<AppRouter>>
>();

export type HostServiceClient = ReturnType<typeof createTRPCClient<AppRouter>>;

export function getHostServiceClient(port: number): HostServiceClient {
	const cached = clientCache.get(port);
	if (cached) return cached;

	const client = createTRPCClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `http://127.0.0.1:${port}/trpc`,
				transformer: superjson,
			}),
		],
	});

	clientCache.set(port, client);
	return client;
}
