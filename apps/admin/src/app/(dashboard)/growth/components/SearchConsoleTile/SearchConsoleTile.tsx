"use client";

import { useLingui } from "@lingui/react/macro";
import { formatNumber, formatPercent } from "@superset/i18n/format";
import { Badge } from "@superset/ui/badge";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { InsightTileFrame } from "../../../components/InsightTileFrame";
import { useGrowthRange } from "../../providers/GrowthRangeProvider";
import { RankedTable } from "../RankedTable";
import { StatStrip } from "../StatStrip";
import { WeeklySeriesChart } from "../WeeklySeriesChart";

const STALE_TIME_MS = 60 * 60 * 1000;
const SEARCH_CONSOLE_URL = "https://search.google.com/search-console";

export function SearchConsoleTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const { weeks } = useGrowthRange();
	const query = useQuery(
		trpc.growth.searchConsole.queryOptions(
			{ weeks },
			{ staleTime: STALE_TIME_MS },
		),
	);
	const data = query.data?.available ? query.data : null;
	const unavailableReason =
		query.data && !query.data.available ? query.data.reason : null;

	const kindLabels = {
		brand: t({ message: "brand" }),
		apache: t({ message: "Apache Superset" }),
		nonbrand: t({ message: "non-brand" }),
	} as const;

	const nonBrandShare =
		data && data.totals.clicks > 0
			? data.byKind.nonbrand.clicks / data.totals.clicks
			: 0;

	const avgPosition = formatNumber(data?.totals.position ?? 0, {
		maximumFractionDigits: 1,
	});
	const nonBrandPct = formatPercent(nonBrandShare);

	const series = data
		? [
				{
					key: "clicks",
					label: t({ message: "Clicks" }),
					values: data.weekly.clicks,
				},
				{
					key: "nonbrand",
					label: t({ message: "Non-brand clicks" }),
					values: data.weekly.nonBrandClicks,
				},
			]
		: [];

	return (
		<InsightTileFrame
			title={t({ message: "Google Search Console" })}
			description={t({
				message:
					"Search impressions and clicks for the last 28 days, with queries split into our brand, Apache Superset (not us), and everything else. Non-brand is the share SEO work exists to grow. Google delivers this data three days late.",
			})}
			lastRefresh={data?.fetchedAt}
			isLoading={query.isLoading}
			error={query.error}
			onRefresh={() => query.refetch()}
			isRefreshing={query.isFetching}
			empty={!data}
			emptyLabel={
				unavailableReason
					? t({
							message: `Not connected: ${unavailableReason}. Add a Google service account to the Search Console property and set GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT.`,
						})
					: undefined
			}
			href={SEARCH_CONSOLE_URL}
			fill
		>
			<div className="space-y-6">
				<StatStrip
					stats={[
						{
							label: t({ message: "Clicks" }),
							value: formatNumber(data?.totals.clicks ?? 0),
						},
						{
							label: t({ message: "Impressions" }),
							value: formatNumber(data?.totals.impressions ?? 0),
						},
						{
							label: t({ message: "Click-through rate" }),
							value: formatPercent(data?.totals.ctr ?? 0),
							hint: t`avg position ${avgPosition}`,
						},
						{
							label: t({ message: "Non-brand clicks" }),
							value: formatNumber(data?.byKind.nonbrand.clicks ?? 0),
							hint: t`${nonBrandPct} of clicks`,
						},
					]}
				/>
				<WeeklySeriesChart
					weeks={data?.weekly.weeks ?? []}
					series={series}
					height={200}
				/>
				<div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
					<RankedTable
						columns={[
							{ key: "query", label: t({ message: "Query" }) },
							{
								key: "clicks",
								label: t({ message: "Clicks" }),
								align: "right",
							},
							{
								key: "impressions",
								label: t({ message: "Impressions" }),
								align: "right",
							},
							{
								key: "position",
								label: t({ message: "Position" }),
								align: "right",
							},
						]}
						rows={(data?.topQueries ?? []).map((row) => ({
							id: row.query,
							cells: {
								query: (
									<span className="flex items-center gap-2">
										<span className="truncate">{row.query}</span>
										{row.kind !== "nonbrand" ? (
											<Badge variant="outline" className="text-[10px]">
												{kindLabels[row.kind]}
											</Badge>
										) : null}
									</span>
								),
								clicks: formatNumber(row.clicks),
								impressions: formatNumber(row.impressions),
								position: formatNumber(row.position, {
									maximumFractionDigits: 1,
								}),
							},
						}))}
					/>
					<RankedTable
						columns={[
							{ key: "page", label: t({ message: "Page" }) },
							{
								key: "clicks",
								label: t({ message: "Clicks" }),
								align: "right",
							},
							{
								key: "impressions",
								label: t({ message: "Impressions" }),
								align: "right",
							},
							{
								key: "ctr",
								label: t({ message: "CTR" }),
								align: "right",
							},
						]}
						rows={(data?.topPages ?? []).map((row) => ({
							id: row.page,
							cells: {
								page: (
									<a
										href={row.page}
										target="_blank"
										rel="noreferrer"
										className="hover:underline"
									>
										{row.page.replace(/^https?:\/\/[^/]+/, "") || "/"}
									</a>
								),
								clicks: formatNumber(row.clicks),
								impressions: formatNumber(row.impressions),
								ctr: formatPercent(row.ctr),
							},
						}))}
					/>
				</div>
			</div>
		</InsightTileFrame>
	);
}
