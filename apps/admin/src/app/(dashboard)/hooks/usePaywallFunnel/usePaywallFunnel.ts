"use client";

import type { RouterOutputs } from "@superset/trpc";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

export type PaywallStageKey =
	RouterOutputs["growth"]["paywallFunnel"]["stages"][number]["key"];

/** Weeks of cohorts the paywall tiles read. */
export const PAYWALL_FUNNEL_WEEKS = 12;

const STALE_TIME_MS = 10 * 60 * 1000;

// The stage funnel and the weekly trend are two views of one HogQL result, so
// they share a query key and the query runs once.
export function usePaywallFunnel() {
	const trpc = useTRPC();
	return useQuery(
		trpc.growth.paywallFunnel.queryOptions(
			{ weeks: PAYWALL_FUNNEL_WEEKS },
			{ staleTime: STALE_TIME_MS },
		),
	);
}
