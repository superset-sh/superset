import type { AppRouter } from "@superset/host-service";
import { getHostServiceQueryMethodOverride } from "@superset/workspace-client/host-transport";
import {
	createTRPCClient,
	httpBatchStreamLink,
	TRPCClientError,
} from "@trpc/client";
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
				// Keep large local query inputs out of the URL. Remote hosts can be one
				// release behind the desktop, though, so they retain GET until the
				// server-side POST-query capability can be assumed fleet-wide.
				methodOverride: getHostServiceQueryMethodOverride(hostUrl),
			}),
		],
	});

	clientCache.set(hostUrl, client);
	return client;
}

const HOST_SERVICE_MAX_RETRIES = 3;
const HOST_SERVICE_RETRY_DELAY_MS = 700;

/**
 * True for a failed host-service request that never got a real response —
 * connection-refused during a restart, a dropped stream, DNS failure. tRPC
 * only populates `data` from a parsed server error envelope, so its absence
 * means the failure was transport-level rather than the server rejecting the
 * request (404, validation, etc.), which should never be retried here.
 */
export function isHostServiceConnectionError(error: unknown): boolean {
	return error instanceof TRPCClientError && error.data == null;
}

/**
 * Query-level `retry` for host-service requests: bounded retries with
 * backoff for connection-level failures only, so a query in flight during a
 * host-service restart self-heals instead of settling into a permanent
 * "Failed to fetch" that only a manual "Try again" click clears. Real
 * application errors (404s, validation) still fail on the first attempt.
 */
export function hostServiceQueryRetry(
	failureCount: number,
	error: unknown,
): boolean {
	return (
		isHostServiceConnectionError(error) &&
		failureCount < HOST_SERVICE_MAX_RETRIES
	);
}

export function hostServiceQueryRetryDelay(attempt: number): number {
	return HOST_SERVICE_RETRY_DELAY_MS * (attempt + 1);
}
