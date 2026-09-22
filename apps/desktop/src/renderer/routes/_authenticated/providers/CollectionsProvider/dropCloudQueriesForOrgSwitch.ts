import { CLOUD_QUERY_KEY_ROOT } from "@superset/cloud-client";
import type { QueryClient } from "@tanstack/react-query";
import { CLOUD_TRPC_ROUTER_ROOTS } from "renderer/lib/cloud-trpc";

const ORG_SCOPED_CLOUD_ROUTERS = new Set<string>(CLOUD_TRPC_ROUTER_ROOTS);

function isOrgScopedCloudQuery(queryKey: readonly unknown[]): boolean {
	const [head, second] = queryKey;
	if (Array.isArray(head)) {
		return typeof head[0] === "string" && ORG_SCOPED_CLOUD_ROUTERS.has(head[0]);
	}
	return (
		head === CLOUD_QUERY_KEY_ROOT &&
		typeof second === "string" &&
		ORG_SCOPED_CLOUD_ROUTERS.has(second)
	);
}

/**
 * Cloud query procedures take no organizationId input (the server scopes by
 * the org header this window sends), so their React Query keys don't encode
 * the org: on a switch the previous org's rows are indistinguishable from the
 * new org's by key alone and must be cleared.
 *
 * `resetQueries`, not `removeQueries`: removing a query drops it from the
 * cache without notifying the observers still mounted on it, so a provider
 * that stays mounted across the switch keeps handing out the previous org's
 * rows until something else makes it re-render. Resetting clears the data and
 * refetches the mounted ones against the new org's header.
 */
export function dropCloudQueriesForOrgSwitch(queryClient: QueryClient): void {
	void queryClient.resetQueries({
		predicate: (query) => isOrgScopedCloudQuery(query.queryKey),
	});
}
