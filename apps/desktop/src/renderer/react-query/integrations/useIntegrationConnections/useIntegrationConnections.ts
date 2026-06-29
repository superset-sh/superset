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
	const { data } = useQuery({
		queryKey: integrationConnectionsQueryKey(organizationId),
		enabled: !!organizationId,
		refetchInterval: REFETCH_INTERVAL_MS,
		queryFn: () =>
			apiTrpcClient.integration.list.query({
				organizationId: organizationId as string,
			}),
	});

	return data ?? [];
}
