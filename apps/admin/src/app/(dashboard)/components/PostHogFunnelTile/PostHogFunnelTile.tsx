"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { FunnelChart } from "../FunnelChart";

const STALE_TIME_MS = 10 * 60 * 1000;

interface PostHogFunnelStep {
	name: string;
	custom_name?: string | null;
	count: number;
}

export function PostHogFunnelTile() {
	const trpc = useTRPC();
	const insight = useQuery(
		trpc.analytics.getInsightResults.queryOptions(
			{ insight: "activationFunnel" },
			{ staleTime: STALE_TIME_MS },
		),
	);

	const steps = Array.isArray(insight.data?.result)
		? (insight.data.result as PostHogFunnelStep[])
		: [];
	const firstCount = steps[0]?.count ?? 0;
	const data = steps.map((step) => ({
		name: step.custom_name ?? step.name,
		count: step.count,
		conversionRate: firstCount > 0 ? (step.count / firstCount) * 100 : 0,
	}));

	return (
		<FunnelChart
			title={insight.data?.name ?? "New-user activation"}
			description="First sign-in view → auth → onboarding → real workspace (last 7d, 2d window)"
			data={data}
			isLoading={insight.isLoading}
			error={insight.error}
		/>
	);
}
