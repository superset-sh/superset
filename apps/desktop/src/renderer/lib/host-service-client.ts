import type { AppRouter } from "@superset/host-service";
import { createHostServiceLinks } from "@superset/workspace-client";
import { type SkipToken, skipToken } from "@tanstack/react-query";
import { createTRPCClient } from "@trpc/client";
import { getHostServiceHeaders } from "./host-service-auth";
import { isHostServiceConnectionError } from "./utils/isHostServiceConnectionError";

export { isHostServiceConnectionError } from "./utils/isHostServiceConnectionError";

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
		links: createHostServiceLinks({
			url: `${hostUrl}/trpc`,
			headers: () => getHostServiceHeaders(hostUrl),
		}),
	});

	clientCache.set(hostUrl, client);
	return client;
}

const HOST_SERVICE_MAX_RETRIES = 3;
const HOST_SERVICE_RETRY_DELAY_MS = 700;

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

/**
 * The abort signal must reach the tRPC call: react-query only cancels an
 * in-flight fetch on last-observer unmount when the queryFn consumed it, and
 * an uncancelled read would land its old-host rows in the cache afterwards.
 */
export type HostServiceQueryContext = { signal: AbortSignal };

/**
 * `skipToken` rather than `enabled: false` for an unreachable host: `enabled`
 * leaves a retry already scheduled by hostServiceQueryRetry running, and it
 * would resolve empty over the cached snapshot once the URL goes null.
 *
 * That retry reaching the skipped fn is what react-query dev builds log as
 * "Attempted to invoke queryFn when set to skipToken" — the handover working,
 * not a misconfiguration.
 */
export function hostServiceQueryFn<T>(
	hostUrl: string | null,
	query: (
		client: HostServiceClient,
		context: HostServiceQueryContext,
	) => Promise<T>,
): ((context: HostServiceQueryContext) => Promise<T>) | SkipToken {
	if (hostUrl === null) return skipToken;
	return (context) => query(getHostServiceClientByUrl(hostUrl), context);
}
