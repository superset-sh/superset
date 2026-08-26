import type { AppRouter } from "@superset/host-service";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { useCallback } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type UsageAccount = RouterOutputs["usage"]["quota"][number];
export type UsageQuotaWindow = UsageAccount["windows"][number];

export const HOST_USAGE_QUOTA_QUERY_KEY = ["host-usage-quota"] as const;
const USAGE_REFETCH_INTERVAL_MS = 5 * 60_000;

/**
 * Subscription quota for every AI CLI login on the given host. The host
 * caches upstream responses for ~5 min (faster polling gets the endpoint
 * 429-blacklisted), so the poll here mostly re-reads that cache; `refresh`
 * bypasses it for an explicit user-initiated update.
 */
export function useHostUsageQuota(hostUrl: string | null) {
	const queryClient = useQueryClient();
	const queryKey = [...HOST_USAGE_QUOTA_QUERY_KEY, hostUrl] as const;

	const query = useQuery({
		queryKey,
		enabled: !!hostUrl,
		queryFn: () => {
			if (!hostUrl) return [] as UsageAccount[];
			return getHostServiceClientByUrl(hostUrl).usage.quota.query();
		},
		refetchInterval: USAGE_REFETCH_INTERVAL_MS,
		staleTime: USAGE_REFETCH_INTERVAL_MS,
	});

	const refresh = useCallback(async () => {
		if (!hostUrl) return;
		const fresh = await getHostServiceClientByUrl(hostUrl).usage.quota.query({
			forceRefresh: true,
		});
		queryClient.setQueryData(queryKey, fresh);
	}, [hostUrl, queryClient, queryKey]);

	return { ...query, refresh };
}
