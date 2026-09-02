"use client";

import { useLingui } from "@lingui/react/macro";
import {
	ADMIN_INSIGHTS,
	type AdminInsightKey,
	POSTHOG_PROJECT_URL,
} from "@superset/trpc/insight-registry";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@superset/ui/chart";
import { Line, LineChart, XAxis, YAxis } from "recharts";

import { useInsightResults } from "../../hooks/useInsightResults";
import { makeDateAxis } from "../../utils/chartAxis";
import { InsightTileFrame } from "../InsightTileFrame";

// Renders TrendsQuery / funnel-trends insight results: an array of series,
// each carrying parallel `data` values and `labels`/`days` for the x axis.
interface TrendSeries {
	data: number[];
	labels?: string[];
	days?: string[];
	label?: string;
	custom_name?: string | null;
}

interface TrendSeriesTileProps {
	insight: AdminInsightKey;
	description?: string;
	valueSuffix?: string;
	// The last bucket is still in progress (weekly intervals): draw the final
	// segment dashed instead of solid.
	dashIncompleteLast?: boolean;
}

const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];

export function TrendSeriesTile({
	insight,
	description,
	valueSuffix,
	dashIncompleteLast,
}: TrendSeriesTileProps) {
	const { t } = useLingui();
	const query = useInsightResults(insight);

	const series = Array.isArray(query.data?.result)
		? (query.data.result as TrendSeries[]).filter((s) => Array.isArray(s.data))
		: [];

	const xLabels = series[0]?.days ?? series[0]?.labels ?? [];
	const xAxis = makeDateAxis(xLabels);
	const lastIndex = xLabels.length - 1;
	const splitIncomplete = Boolean(dashIncompleteLast) && xLabels.length >= 2;
	const data = xLabels.map((x, i) => {
		const point: Record<string, unknown> = { x };
		series.forEach((s, seriesIndex) => {
			if (splitIncomplete) {
				point[`s${seriesIndex}`] = i === lastIndex ? null : s.data[i];
				point[`s${seriesIndex}partial`] = i >= lastIndex - 1 ? s.data[i] : null;
			} else {
				point[`s${seriesIndex}`] = s.data[i];
			}
		});
		return point;
	});

	const chartConfig = Object.fromEntries(
		series.flatMap((s, i) => {
			const label =
				s.custom_name ??
				s.label ??
				t({
					message: `series ${i + 1}`,
				});
			const color = SERIES_COLORS[i % SERIES_COLORS.length];
			return [
				[`s${i}`, { label, color }],
				...(splitIncomplete
					? [
							[
								`s${i}partial`,
								{
									label: t({
										message: `${label} (partial week)`,
									}),
									color,
								},
							],
						]
					: []),
			];
		}),
	) satisfies ChartConfig;

	return (
		<InsightTileFrame
			title={query.data?.name ?? insight}
			description={description}
			lastRefresh={query.data?.lastRefresh}
			isLoading={query.isLoading || query.data?.result == null}
			error={query.error}
			href={`${POSTHOG_PROJECT_URL}/insights/${ADMIN_INSIGHTS[insight]}`}
			onRefresh={() => query.refetch()}
			isRefreshing={query.isFetching}
			empty={data.length === 0}
		>
			<ChartContainer config={chartConfig} className="h-[240px] w-full">
				<LineChart data={data}>
					<XAxis
						dataKey="x"
						tickLine={false}
						axisLine={false}
						fontSize={11}
						ticks={xAxis.ticks}
						tickFormatter={xAxis.tickFormatter}
					/>
					<YAxis
						tickLine={false}
						axisLine={false}
						width={44}
						tickFormatter={
							valueSuffix ? (v: number) => `${v}${valueSuffix}` : undefined
						}
					/>
					<ChartTooltip content={<ChartTooltipContent />} />
					{series.map((_, i) => (
						<Line
							// biome-ignore lint/suspicious/noArrayIndexKey: series order is the identity
							key={i}
							dataKey={`s${i}`}
							stroke={`var(--color-s${i})`}
							strokeWidth={2}
							dot={false}
							type="monotone"
						/>
					))}
					{splitIncomplete
						? series.map((_, i) => (
								<Line
									// biome-ignore lint/suspicious/noArrayIndexKey: series order is the identity
									key={`p${i}`}
									dataKey={`s${i}partial`}
									stroke={`var(--color-s${i})`}
									strokeWidth={2}
									strokeDasharray="5 5"
									dot={false}
									type="monotone"
									tooltipType={undefined}
								/>
							))
						: null}
				</LineChart>
			</ChartContainer>
		</InsightTileFrame>
	);
}
