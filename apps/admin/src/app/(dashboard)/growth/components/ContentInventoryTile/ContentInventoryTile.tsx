"use client";

import { useLingui } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { useGrowthLabels } from "../../hooks/useGrowthLabels";
import { useGrowthRange } from "../../providers/GrowthRangeProvider";
import { StatStrip } from "../StatStrip";
import { WeeklyTile } from "../WeeklyTile";

const STALE_TIME_MS = 60 * 60 * 1000;

export function ContentInventoryTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const labels = useGrowthLabels();
	const { weeks } = useGrowthRange();
	const query = useQuery(
		trpc.growth.contentInventory.queryOptions(
			{ weeks },
			{ staleTime: STALE_TIME_MS },
		),
	);
	const data = query.data;
	const series = (data?.weekly.series ?? []).map((s) => ({
		...s,
		label: labels.section(s.key),
	}));

	return (
		<WeeklyTile
			title={t({ message: "Content published or updated" })}
			description={t({
				message:
					"From the public sitemap: compare pages, posts, and changelog entries by the week they were published or last revised.",
			})}
			weeks={data?.weekly.weeks ?? []}
			series={series}
			stacked
			lastRefresh={data?.fetchedAt}
			isLoading={query.isLoading}
			error={query.error}
			onRefresh={() => query.refetch()}
			isRefreshing={query.isFetching}
		>
			<StatStrip
				stats={(data?.sections ?? []).map((section) => ({
					label: labels.section(section.section),
					value: formatNumber(section.pages),
					hint: t({
						message: `${formatNumber(section.updatedRecently)} touched in ${formatNumber(data?.recentDays ?? 30)} days`,
					}),
				}))}
			/>
		</WeeklyTile>
	);
}
