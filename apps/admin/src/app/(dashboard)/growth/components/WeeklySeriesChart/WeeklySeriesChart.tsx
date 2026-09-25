"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@superset/ui/chart";
import { Bar, ComposedChart, Line, XAxis, YAxis } from "recharts";

import { makeDateAxis } from "../../../utils/chartAxis";

export interface ChartSeries {
	key: string;
	label: string;
	values: number[];
}

interface WeeklySeriesChartProps {
	weeks: string[];
	series: ChartSeries[];
	// Stacked bars read best for a mix that sums to a whole (channels,
	// sections); lines for series compared against each other.
	stacked?: boolean;
	valueSuffix?: string;
	height?: number;
	// Fill the parent instead of a fixed height; the parent must size itself.
	fill?: boolean;
}

const SERIES_COLORS = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
	"var(--chart-5)",
	"oklch(0.6 0.15 320)",
	"oklch(0.55 0.12 20)",
	"oklch(0.7 0.1 140)",
	"oklch(0.5 0.05 250)",
];

// Recharts keys series by dataKey, so anything that is not a plain identifier
// (a domain with dots) is mapped to a safe key first.
function safeKey(index: number): string {
	return `s${index}`;
}

export function WeeklySeriesChart({
	weeks,
	series,
	stacked,
	valueSuffix,
	height = 240,
	fill,
}: WeeklySeriesChartProps) {
	const data = weeks.map((week, i) => {
		const point: Record<string, string | number> = { x: week };
		series.forEach((s, seriesIndex) => {
			point[safeKey(seriesIndex)] = s.values[i] ?? 0;
		});
		return point;
	});

	const chartConfig = Object.fromEntries(
		series.map((s, i) => [
			safeKey(i),
			{ label: s.label, color: SERIES_COLORS[i % SERIES_COLORS.length] },
		]),
	) satisfies ChartConfig;

	const xAxis = makeDateAxis(weeks);

	return (
		<ChartContainer
			config={chartConfig}
			className="aspect-auto h-full w-full"
			style={fill ? undefined : { height }}
		>
			<ComposedChart data={data}>
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
				{series.length > 1 ? (
					<ChartLegend content={<ChartLegendContent />} />
				) : null}
				{series.map((_, i) =>
					stacked ? (
						<Bar
							key={safeKey(i)}
							dataKey={safeKey(i)}
							stackId="stack"
							fill={`var(--color-${safeKey(i)})`}
							radius={i === series.length - 1 ? [2, 2, 0, 0] : 0}
						/>
					) : (
						<Line
							key={safeKey(i)}
							dataKey={safeKey(i)}
							stroke={`var(--color-${safeKey(i)})`}
							strokeWidth={2}
							dot={false}
							type="monotone"
						/>
					),
				)}
			</ComposedChart>
		</ChartContainer>
	);
}
