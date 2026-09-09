import { retryLink } from "@trpc/client";
import { isTransportError } from "./errors";

/**
 * Retry a request that never reached the server, once.
 *
 * iOS drops pooled HTTPS connections that have gone idle, and Apple's guidance
 * for the -1005 that produces is to retry rather than surface it (QA1941). A
 * phone in a pocket hits this on the first tap after every idle stretch.
 *
 * Queries only. A mutation is not safe to replay: `workspaces.create` picks a
 * fresh friendly-random branch when the caller supplies none, and dedupes on
 * the branch rather than on the client-minted id, so a replayed create lands a
 * second workspace instead of resolving to the first.
 */
export function transportRetryLink() {
	return retryLink({
		retry: ({ op, error, attempts }) =>
			attempts === 1 && op.type === "query" && isTransportError(error),
	});
}
