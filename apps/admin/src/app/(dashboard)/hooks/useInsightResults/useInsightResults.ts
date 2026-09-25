"use client";

import type { AdminInsightKey } from "@superset/trpc/insight-registry";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

const STALE_TIME_MS = 10 * 60 * 1000;
const PENDING_POLL_MS = 3 * 1000;

// PostHog returns its cached result right away and recomputes stale insights in
// the background, so a cold insight comes back `pending` with no result yet.
// Poll until it lands instead of holding the request open for the recompute.
export function useInsightResults(insight: AdminInsightKey) {
	const trpc = useTRPC();
	return useQuery(
		trpc.analytics.getInsightResults.queryOptions(
			{ insight },
			{
				staleTime: STALE_TIME_MS,
				refetchInterval: (q) =>
					q.state.data?.pending ? PENDING_POLL_MS : false,
			},
		),
	);
}
