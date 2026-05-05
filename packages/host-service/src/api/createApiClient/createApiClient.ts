import type { AppRouter } from "@superset/trpc";
import { createTRPCClient, httpBatchLink, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import SuperJSON from "superjson";
import type { ApiAuthProvider } from "../../providers/auth";
import type { ApiClient } from "../../types";

function isUnauthorizedError(err: unknown): boolean {
	if (!err || typeof err !== "object") return false;
	const e = err as { data?: { code?: string; httpStatus?: number } };
	return e.data?.code === "UNAUTHORIZED" || e.data?.httpStatus === 401;
}

/**
 * One-shot retry on UNAUTHORIZED. The provider's cached JWT can outlive its
 * actual validity (clock skew, JWKS rotation, session revoked mid-flight) —
 * dropping the cache and retrying once recovers without bubbling 401 back
 * up to user-facing flows like "register host".
 */
function retryOnUnauthorizedLink(
	authProvider: ApiAuthProvider,
): TRPCLink<AppRouter> {
	return () =>
		({ op, next }) =>
			observable((observer) => {
				let attempted = false;
				let subscription: { unsubscribe: () => void } | undefined;

				const start = () => {
					subscription = next(op).subscribe({
						next: (value) => observer.next(value),
						error: (err) => {
							if (!attempted && isUnauthorizedError(err)) {
								attempted = true;
								authProvider.invalidateCache();
								start();
								return;
							}
							observer.error(err);
						},
						complete: () => observer.complete(),
					});
				};

				start();

				return () => {
					subscription?.unsubscribe();
				};
			});
}

export function createApiClient(
	baseUrl: string,
	authProvider: ApiAuthProvider,
): ApiClient {
	return createTRPCClient<AppRouter>({
		links: [
			retryOnUnauthorizedLink(authProvider),
			httpBatchLink({
				url: `${baseUrl}/api/trpc`,
				transformer: SuperJSON,
				async headers() {
					return authProvider.getHeaders();
				},
			}),
		],
	});
}
