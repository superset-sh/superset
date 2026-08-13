"use client";

import type { AdminInsightKey } from "@superset/trpc";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@superset/ui/chart";
import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, XAxis, YAxis } from "recharts";

import { useTRPC } from "@/trpc/react";

import { InsightTileFrame } from "../InsightTileFrame";

const STALE_TIME_MS = 10 * 60 * 1000;

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
}

const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];

export function TrendSeriesTile({
	insight,
	description,
	valueSuffix,
}: TrendSeriesTileProps) {
	const trpc = useTRPC();
	const query = useQuery(
		trpc.analytics.getInsightResults.queryOptions(
			{ insight },
			{ staleTime: STALE_TIME_MS },
		),
	);

	const series = Array.isArray(query.data?.result)
		? (query.data.result as TrendSeries[]).filter((s) => Array.isArray(s.data))
		: [];

	const xLabels = series[0]?.days ?? series[0]?.labels ?? [];
	const data = xLabels.map((x, i) => {
		const point: Record<string, unknown> = { x };
		series.forEach((s, seriesIndex) => {
			point[`s${seriesIndex}`] = s.data[i];
		});
		return point;
	});

	const chartConfig = Object.fromEntries(
		series.map((s, i) => [
			`s${i}`,
			{
				label: s.custom_name ?? s.label ?? `series ${i + 1}`,
				color: SERIES_COLORS[i % SERIES_COLORS.length],
			},
		]),
	) satisfies ChartConfig;

	return (
		<InsightTileFrame
			title={query.data?.name ?? insight}
			description={description}
			lastRefresh={query.data?.lastRefresh}
			isLoading={query.isLoading}
			error={query.error}
			onRefresh={() => query.refetch()}
			isRefreshing={query.isFetching}
			empty={data.length === 0}
		>
			<ChartContainer config={chartConfig} className="h-[240px] w-full">
				<LineChart data={data}>
					<XAxis dataKey="x" tickLine={false} axisLine={false} fontSize={11} />
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
				</LineChart>
			</ChartContainer>
		</InsightTileFrame>
	);
}
