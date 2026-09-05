"use client";

import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { useGrowthLabels } from "../../hooks/useGrowthLabels";
import { useGrowthRange } from "../../providers/GrowthRangeProvider";
import { WeeklyTile } from "../WeeklyTile";

const STALE_TIME_MS = 10 * 60 * 1000;

export function ChannelMixTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const labels = useGrowthLabels();
	const { weeks } = useGrowthRange();
	const query = useQuery(
		trpc.growth.channelMix.queryOptions(
			{ weeks },
			{ staleTime: STALE_TIME_MS },
		),
	);
	const series = (query.data?.series ?? []).map((s) => ({
		...s,
		label: labels.channel(s.key),
	}));

	return (
		<WeeklyTile
			title={t({ message: "Visitors by channel" })}
			description={t({
				message:
					"Unique visitors starting a session on superset.sh or the docs each week, by how they arrived. AI assistants means a link inside ChatGPT, Claude, Gemini, or Perplexity.",
			})}
			weeks={query.data?.weeks ?? []}
			series={series}
			query={query.data?.query}
			stacked
			isLoading={query.isLoading}
			error={query.error}
			onRefresh={() => query.refetch()}
			isRefreshing={query.isFetching}
		/>
	);
}
