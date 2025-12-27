"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@superset/ui/chart";
import { Skeleton } from "@superset/ui/skeleton";
import type { ReactNode } from "react";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
import colors from "tailwindcss/colors";

interface TrafficSource {
	source: string;
	count: number;
}

interface TrafficSourcesChartProps {
	data: TrafficSource[] | null | undefined;
	isLoading?: boolean;
	error?: { message: string } | null;
	headerAction?: ReactNode;
}

// Tailwind 500 grade colors
const COLORS = [
	colors.blue[500],
	colors.purple[500],
	colors.teal[500],
	colors.pink[500],
	colors.orange[500],
	colors.lime[500],
	colors.cyan[500],
	colors.rose[500],
	colors.violet[500],
	colors.green[500],
];

const chartConfig = {
	count: {
		label: "Visitors",
		color: "var(--chart-3)",
	},
} satisfies ChartConfig;

export function TrafficSourcesChart({
	data,
	isLoading,
	error,
	headerAction,
}: TrafficSourcesChartProps) {
	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle>Traffic Sources</CardTitle>
						<CardDescription>Where visitors came from</CardDescription>
					</div>
					{headerAction}
				</div>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<Skeleton className="h-[300px] w-full" />
				) : error ? (
					<div className="flex h-[300px] items-center justify-center">
						<p className="text-destructive text-sm">Failed to load</p>
					</div>
				) : !data || data.length === 0 ? (
					<div className="flex h-[300px] items-center justify-center rounded-md border border-dashed">
						<p className="text-muted-foreground text-sm">
							No traffic data available for this period
						</p>
					</div>
				) : (
					<ChartContainer config={chartConfig} className="h-[300px] w-full">
						<BarChart
							data={data}
							layout="vertical"
							margin={{ left: 0, right: 40 }}
						>
							<XAxis type="number" hide />
							<YAxis
								type="category"
								dataKey="source"
								tickLine={false}
								axisLine={false}
								width={180}
								tick={{ fontSize: 12 }}
							/>
							<ChartTooltip
								cursor={false}
								content={
									<ChartTooltipContent
										formatter={(value) => `${value} visitors`}
									/>
								}
							/>
							<Bar
								dataKey="count"
								radius={[0, 4, 4, 0]}
								label={{
									position: "right",
									fontSize: 12,
									formatter: (value: number) => value.toLocaleString(),
								}}
							>
								{data.map((entry, index) => (
									<Cell
										key={entry.source}
										fill={COLORS[index % COLORS.length]}
									/>
								))}
							</Bar>
						</BarChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}
