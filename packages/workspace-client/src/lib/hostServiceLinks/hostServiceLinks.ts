import type { AppRouter } from "@superset/host-service/trpc";
import {
	httpBatchStreamLink,
	retryLink,
	splitLink,
	TRPCClientError,
	type TRPCLink,
} from "@trpc/client";
import superjson from "superjson";

/**
 * tRPC endpoints that rejected a POSTed query with METHOD_NOT_SUPPORTED.
 * Module-level so every client pointed at the same host learns once, and a
 * host that has fallen back stays on GET until reload.
 */
const legacyGetEndpoints = new Set<string>();

export interface HostServiceLinkOptions {
	/** The host's tRPC endpoint, e.g. `http://127.0.0.1:PORT/trpc`. */
	url: string;
	headers?: () => Record<string, string>;
}

/**
 * True when a host answered a POSTed query with tRPC's method check — the
 * server predates `allowMethodOverride` (host-service 1.24.0) and only takes
 * queries as GET. Applies to remote hosts nobody updated and to a local
 * host-service spawned by a stale CLI that the desktop then adopted.
 */
export function isMethodOverrideRejection(error: unknown): boolean {
	return (
		error instanceof TRPCClientError &&
		error.data?.code === "METHOD_NOT_SUPPORTED"
	);
}

/**
 * The link chain every renderer host-service client uses.
 *
 * Streaming batch link: same-tick calls share one HTTP request and one CORS
 * preflight, but each result streams as soon as it's ready — no
 * slowest-in-batch latency (the reason #3879 unbatched the old buffering
 * httpBatchLink). All renderer clients share Chromium's 6-connections-per-
 * origin pool with every other host-service request, so sockets are the
 * scarce resource here.
 *
 * Queries go out as POST: host-service has no HTTP cache in front of it, so
 * there's no upside to GET, and a query with a large input (git.getDiffBulk's
 * file-path list, a same-tick batch across many workspaces) can otherwise
 * produce a GET URL long enough to blow past the server's header-size limit,
 * failing even the CORS preflight before it reaches the route. Hosts older
 * than 1.24.0 reject that override, so the first such rejection flips the
 * endpoint to plain GET and replays the query there.
 */
export function createHostServiceLinks(
	options: HostServiceLinkOptions,
): TRPCLink<AppRouter>[] {
	const { url, headers } = options;
	const shared = { url, transformer: superjson, headers };
	return [
		retryLink({
			retry: ({ op, error, attempts }) => {
				if (attempts > 1 || op.type !== "query") return false;
				if (!isMethodOverrideRejection(error)) return false;
				legacyGetEndpoints.add(url);
				return true;
			},
		}),
		splitLink({
			condition: () => legacyGetEndpoints.has(url),
			true: httpBatchStreamLink(shared),
			false: httpBatchStreamLink({ ...shared, methodOverride: "POST" }),
		}),
	];
}
