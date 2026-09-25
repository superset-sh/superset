import type { AppRouter } from "@superset/host-service";
import { queryOptions, useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type UsageHistory = RouterOutputs["usage"]["history"];

const HISTORY_STALE_MS = 5 * 60 * 1000;
const HISTORY_CACHE_MS = 24 * 60 * 60 * 1000;

/**
 * Token/cost history from the host's transcript logs. Expensive on the host
 * (multi-GB scan in its worker pool), so no interval polling — refetched on
 * range change and after staleness. Retain results across a day of navigation
 * so returning to Usage refreshes in the background instead of blanking it.
 */
export function hostUsageHistoryOptions(hostUrl: string | null, days: number) {
	return queryOptions({
		queryKey: ["host-usage-history", hostUrl, days] as const,
		enabled: !!hostUrl,
		queryFn: () => {
			if (!hostUrl) return null;
			return getHostServiceClientByUrl(hostUrl).usage.history.query({ days });
		},
		staleTime: HISTORY_STALE_MS,
		gcTime: HISTORY_CACHE_MS,
		// A range change may reuse this host's chart, never another host's data.
		placeholderData: (previousData, previousQuery) =>
			previousQuery?.queryKey[1] === hostUrl ? previousData : undefined,
	});
}

export function useHostUsageHistory(hostUrl: string | null, days: number) {
	return useQuery(hostUsageHistoryOptions(hostUrl, days));
}
