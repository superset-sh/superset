"use client";

import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { useGrowthLabels } from "../../hooks/useGrowthLabels";
import { useGrowthRange } from "../../providers/GrowthRangeProvider";
import { WeeklyTile } from "../WeeklyTile";

const STALE_TIME_MS = 10 * 60 * 1000;

export function LandingSectionsTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const labels = useGrowthLabels();
	const { weeks } = useGrowthRange();
	const query = useQuery(
		trpc.growth.landingSections.queryOptions(
			{ weeks },
			{ staleTime: STALE_TIME_MS },
		),
	);
	const series = (query.data?.series ?? []).map((s) => ({
		...s,
		label: labels.section(s.key),
	}));

	return (
		<WeeklyTile
			title={t({ message: "Entries by section" })}
			description={t({
				message:
					"Where sessions begin: the home page, a compare page, the docs, a post, or a changelog entry. Content that ranks shows up here before it shows up in signups.",
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
