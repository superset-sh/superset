import type { AppRouter } from "@superset/host-service";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type UsageHistory = RouterOutputs["usage"]["history"];

const HISTORY_STALE_MS = 5 * 60 * 1000;

/**
 * Token/cost history from the host's transcript logs. Expensive on the host
 * (multi-GB scan in its worker pool), so no interval polling — refetched on
 * range change and after staleness. `keepPreviousData` keeps the old chart
 * up while a new range loads.
 */
export function useHostUsageHistory(hostUrl: string | null, days: number) {
	return useQuery({
		queryKey: ["host-usage-history", hostUrl, days] as const,
		enabled: !!hostUrl,
		queryFn: () => {
			if (!hostUrl) return null;
			return getHostServiceClientByUrl(hostUrl).usage.history.query({ days });
		},
		staleTime: HISTORY_STALE_MS,
		placeholderData: keepPreviousData,
	});
}
