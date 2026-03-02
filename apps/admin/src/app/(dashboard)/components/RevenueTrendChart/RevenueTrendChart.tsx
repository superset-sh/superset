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
import { Area, AreaChart, XAxis, YAxis } from "recharts";

interface RevenueData {
	date: string;
	revenue: number;
	mrr: number;
}

interface RevenueTrendChartProps {
	data: RevenueData[] | null | undefined;
	isLoading?: boolean;
	error?: { message: string } | null;
	headerAction?: ReactNode;
}

const chartConfig = {
	mrr: {
		label: "MRR",
		color: "var(--chart-4)",
	},
} satisfies ChartConfig;

function formatCurrency(value: number): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(value);
}

export function RevenueTrendChart({
	data,
	isLoading,
	error,
	headerAction,
}: RevenueTrendChartProps) {
	const currentMrr = data?.[data.length - 1]?.mrr ?? 0;

	// Show ~7 ticks evenly distributed
	const tickInterval = data ? Math.max(0, Math.floor(data.length / 7) - 1) : 0;

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle>Revenue</CardTitle>
						<CardDescription>{formatCurrency(currentMrr)} MRR</CardDescription>
					</div>
					{headerAction}
				</div>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<Skeleton className="h-[200px] w-full" />
				) : error ? (
					<div className="flex h-[200px] items-center justify-center">
						<p className="text-destructive text-sm">Failed to load</p>
					</div>
				) : !data || data.length === 0 ? (
					<div className="flex h-[200px] items-center justify-center rounded-md border border-dashed">
						<p className="text-muted-foreground text-sm">
							No revenue data available for this period
						</p>
					</div>
				) : (
					<ChartContainer config={chartConfig} className="h-[200px] w-full">
						<AreaChart data={data} margin={{ left: 0, right: 0 }}>
							<XAxis
								dataKey="date"
								tickLine={false}
								axisLine={false}
								tickFormatter={(v) =>
									new Date(v).toLocaleDateString("en-US", {
										month: "short",
										day: "numeric",
									})
								}
								tick={{ fontSize: 12 }}
								interval={tickInterval}
								padding={{ left: 20, right: 20 }}
							/>
							<YAxis hide />
							<ChartTooltip
								content={
									<ChartTooltipContent
										formatter={(value) => formatCurrency(value as number)}
									/>
								}
							/>
							<Area
								type="monotone"
								dataKey="mrr"
								stroke="var(--color-mrr)"
								fill="var(--color-mrr)"
								fillOpacity={0.2}
							/>
						</AreaChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}
