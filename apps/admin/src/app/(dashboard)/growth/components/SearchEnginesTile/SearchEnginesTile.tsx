"use client";

import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { useGrowthRange } from "../../providers/GrowthRangeProvider";
import { WeeklyTile } from "../WeeklyTile";

const STALE_TIME_MS = 10 * 60 * 1000;

export function SearchEnginesTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const { weeks } = useGrowthRange();
	const query = useQuery(
		trpc.growth.searchEngines.queryOptions(
			{ weeks },
			{ staleTime: STALE_TIME_MS },
		),
	);
	const series = (query.data?.series ?? []).map((s) => ({
		...s,
		label: s.key === "Other" ? t({ message: "Other" }) : s.key,
	}));

	return (
		<WeeklyTile
			title={t({ message: "Organic search by engine" })}
			description={t({
				message:
					"Weekly visitors arriving from a search results page. Search Console below says which queries they typed.",
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
