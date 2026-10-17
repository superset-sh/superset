import { ORGANIZATION_HEADER } from "@superset/shared/constants";
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

async function getBatchAuthHeaders(
	authProvider: ApiAuthProvider,
	signals: (AbortSignal | null | undefined)[],
): Promise<Record<string, string>> {
	const controller = new AbortController();
	const abortIfAllCancelled = () => {
		if (signals.every((signal) => signal?.aborted)) controller.abort();
	};
	for (const signal of signals) {
		signal?.addEventListener("abort", abortIfAllCancelled, { once: true });
	}
	abortIfAllCancelled();
	let rejectOnAbort: (() => void) | undefined;
	try {
		controller.signal.throwIfAborted();
		const aborted = new Promise<never>((_, reject) => {
			rejectOnAbort = () => reject(controller.signal.reason);
			controller.signal.addEventListener("abort", rejectOnAbort, {
				once: true,
			});
		});
		return await Promise.race([
			aborted,
			authProvider.getHeaders(controller.signal),
		]);
	} finally {
		if (rejectOnAbort) {
			controller.signal.removeEventListener("abort", rejectOnAbort);
		}
		for (const signal of signals) {
			signal?.removeEventListener("abort", abortIfAllCancelled);
		}
	}
}

export function createApiClient(
	baseUrl: string,
	authProvider: ApiAuthProvider,
	organizationId: string,
): ApiClient {
	return createTRPCClient<AppRouter>({
		links: [
			retryOnUnauthorizedLink(authProvider),
			httpBatchLink({
				url: `${baseUrl}/api/trpc`,
				transformer: SuperJSON,
				async headers({ opList }) {
					// Pin every host→cloud request to this host's bound org. The
					// host's session-exchanged JWT (better-auth jwt plugin) only
					// carries `organizationIds`, not a singular active org, so
					// `protectedProcedure` would otherwise reject any call that
					// reads `ctx.activeOrganizationId`. The cloud middleware
					// validates membership before honoring this header.
					return {
						...(await getBatchAuthHeaders(
							authProvider,
							opList.map((op) => op.signal),
						)),
						[ORGANIZATION_HEADER]: organizationId,
					};
				},
			}),
		],
	});
}
