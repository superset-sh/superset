import { useQuery } from "@tanstack/react-query";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

export const integrationConnectionsQueryKey = (
	organizationId: string | null | undefined,
) => ["integration", "list", organizationId] as const;

// Integration connections rarely change; poll while a screen using them is
// mounted (Reference data — query + view-time polling, no live sync).
const REFETCH_INTERVAL_MS = 30_000;

/**
 * Org-scoped integration connections (linear/slack/etc). Server-owned reference
 * data fetched via tRPC and cached, replacing the synced TanStack DB collection.
 * The `integration.list` procedure masks OAuth tokens server-side.
 */
export function useIntegrationConnections(
	organizationId: string | null | undefined,
) {
	const { data, isLoading } = useQuery({
		queryKey: integrationConnectionsQueryKey(organizationId),
		enabled: !!organizationId,
		refetchInterval: REFETCH_INTERVAL_MS,
		queryFn: () =>
			apiTrpcClient.integration.list.query({
				organizationId: organizationId as string,
			}),
	});

	// `connections` defaults to an empty array; `isLoading` lets callers avoid
	// flashing a "not connected" state before the first fetch resolves (the
	// synced collection this replaced was cache-first / instant).
	return { connections: data ?? [], isLoading };
}
