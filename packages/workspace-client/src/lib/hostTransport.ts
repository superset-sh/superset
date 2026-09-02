import type { AppRouter } from "@superset/host-service/trpc";
import {
	type HTTPBatchStreamLinkOptions,
	httpBatchStreamLink,
	type Operation,
	retryLink,
	splitLink,
	type TRPCClientError,
	type TRPCLink,
} from "@trpc/client";
import superjson from "superjson";

type QueryMethodOverride = "POST" | undefined;

export const HOST_SERVICE_POST_QUERY_REPROBE_MS = 60_000;

interface HostServiceQueryMethodPolicy {
	getMethodOverride: () => QueryMethodOverride;
	retryWithoutMethodOverride: (options: {
		attempts: number;
		error: TRPCClientError<AppRouter>;
		op: Pick<Operation, "type">;
	}) => boolean;
}

export type HostServiceFetch = NonNullable<
	HTTPBatchStreamLinkOptions<AppRouter["_def"]["_config"]["$types"]>["fetch"]
>;

interface HostServiceTransportOptions {
	fetch?: HostServiceFetch;
	hostUrl: string;
	headers?: () => Record<string, string>;
	now?: () => number;
}

/**
 * Optimistically uses POST queries, then remembers an explicit old-host
 * rejection and temporarily retries that client's queries with tRPC's default
 * GET method. POST is re-probed after a cooldown so hosts upgraded in place can
 * recover without a Desktop restart or URL change.
 */
export function createHostServiceQueryMethodPolicy(
	now: () => number = Date.now,
): HostServiceQueryMethodPolicy {
	let getFallbackUntil = 0;

	return {
		getMethodOverride: () => (now() >= getFallbackUntil ? "POST" : undefined),
		retryWithoutMethodOverride: ({ attempts, error, op }) => {
			const shouldRetry =
				op.type === "query" &&
				attempts === 1 &&
				error.data?.code === "METHOD_NOT_SUPPORTED" &&
				error.data.httpStatus === 405;
			if (shouldRetry) {
				getFallbackUntil = now() + HOST_SERVICE_POST_QUERY_REPROBE_MS;
			}
			return shouldRetry;
		},
	};
}

/**
 * Creates an adaptive host-service transport. Current hosts keep POST queries
 * so large inputs stay out of URLs; previous-release hosts are detected by
 * their 405/METHOD_NOT_SUPPORTED response and use GET for a bounded cooldown
 * before POST is re-probed. Mutations remain POST in both branches.
 */
export function createHostServiceTransportLinks({
	fetch,
	hostUrl,
	headers = () => ({}),
	now,
}: HostServiceTransportOptions): TRPCLink<AppRouter>[] {
	const queryMethodPolicy = createHostServiceQueryMethodPolicy(now);
	const linkOptions = {
		url: `${hostUrl}/trpc`,
		transformer: superjson,
		headers,
		...(fetch ? { fetch } : {}),
	};
	const getCompatibleLink = httpBatchStreamLink(linkOptions);
	const postQueryLink = httpBatchStreamLink({
		...linkOptions,
		methodOverride: "POST",
	});

	return [
		retryLink<AppRouter>({
			retry: (options) => queryMethodPolicy.retryWithoutMethodOverride(options),
		}),
		splitLink<AppRouter>({
			condition: () => queryMethodPolicy.getMethodOverride() === "POST",
			true: postQueryLink,
			false: getCompatibleLink,
		}),
	];
}
