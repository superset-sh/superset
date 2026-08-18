"use client";

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
import { Bar, ComposedChart, Line, XAxis, YAxis } from "recharts";

import { useInsightResults } from "../../hooks/useInsightResults";
import { makeDateAxis } from "../../utils/chartAxis";
import { InsightTileFrame } from "../InsightTileFrame";

// Renders a saved HogQL (DataVisualizationNode) insight whose result is an
// array of rows. Column order is part of the canonical definition in PostHog,
// so series are addressed by column index.
export interface HogQLSeries {
	column: number;
	key: string;
	label: string;
	kind: "line" | "bar";
	rightAxis?: boolean;
	suffix?: string;
}

interface HogQLLineTileProps {
	insight: AdminInsightKey;
	description?: string;
	xColumn: number;
	series: readonly HogQLSeries[];
}

const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];

export function HogQLLineTile({
	insight,
	description,
	xColumn,
	series,
}: HogQLLineTileProps) {
	const query = useInsightResults(insight);

	const rows = Array.isArray(query.data?.result)
		? (query.data.result as unknown[][]).filter(Array.isArray)
		: [];

	const data = rows.map((row) => {
		const point: Record<string, unknown> = { x: row[xColumn] };
		for (const s of series) {
			point[s.key] = row[s.column];
		}
		return point;
	});

	const chartConfig = Object.fromEntries(
		series.map((s, i) => [
			s.key,
			{ label: s.label, color: SERIES_COLORS[i % SERIES_COLORS.length] },
		]),
	) satisfies ChartConfig;

	const hasRightAxis = series.some((s) => s.rightAxis);
	const xAxis = makeDateAxis(data.map((point) => point.x as string | number));

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
				<ComposedChart data={data}>
					<XAxis
						dataKey="x"
						tickLine={false}
						axisLine={false}
						fontSize={11}
						ticks={xAxis.ticks}
						tickFormatter={xAxis.tickFormatter}
					/>
					<YAxis yAxisId="left" tickLine={false} axisLine={false} width={40} />
					{hasRightAxis ? (
						<YAxis yAxisId="right" orientation="right" hide />
					) : null}
					<ChartTooltip content={<ChartTooltipContent />} />
					{series.map((s) =>
						s.kind === "bar" ? (
							<Bar
								key={s.key}
								dataKey={s.key}
								yAxisId={s.rightAxis ? "right" : "left"}
								fill={`var(--color-${s.key})`}
								opacity={0.35}
								radius={2}
							/>
						) : (
							<Line
								key={s.key}
								dataKey={s.key}
								yAxisId={s.rightAxis ? "right" : "left"}
								stroke={`var(--color-${s.key})`}
								strokeWidth={2}
								dot={false}
								type="monotone"
							/>
						),
					)}
				</ComposedChart>
			</ChartContainer>
		</InsightTileFrame>
	);
}
