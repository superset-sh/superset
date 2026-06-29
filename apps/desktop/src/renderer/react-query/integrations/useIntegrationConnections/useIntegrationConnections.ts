import { useQuery } from "@tanstack/react-query";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

export const integrationConnectionsQueryKey = (
	organizationId: string | null | undefined,
) => ["integration", "list", organizationId] as const;

// Poll while a consuming screen is mounted; connections rarely change.
const REFETCH_INTERVAL_MS = 30_000;

/**
 * Org-scoped integration connections, fetched via tRPC (replaces the synced
 * collection). `integration.list` masks OAuth tokens server-side.
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

	// isLoading lets callers avoid flashing "not connected" before the first
	// fetch — the synced collection this replaced was cache-first.
	return { connections: data ?? [], isLoading };
}
