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
import { Bar, BarChart, XAxis, YAxis } from "recharts";

interface FunnelStep {
	name: string;
	count: number;
	conversionRate: number;
}

interface FunnelChartProps {
	title: string;
	description?: string;
	data: FunnelStep[] | null | undefined;
	isLoading?: boolean;
	error?: { message: string } | null;
	headerAction?: ReactNode;
}

const chartConfig = {
	count: {
		label: "Users",
		color: "var(--chart-1)",
	},
} satisfies ChartConfig;

export function FunnelChart({
	title,
	description,
	data,
	isLoading,
	error,
	headerAction,
}: FunnelChartProps) {
	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<CardTitle>{title}</CardTitle>
					{headerAction}
				</div>
				{description && <CardDescription>{description}</CardDescription>}
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="space-y-3">
						<Skeleton className="h-6 w-full" />
						<Skeleton className="h-6 w-4/5" />
						<Skeleton className="h-6 w-3/5" />
						<Skeleton className="h-6 w-2/5" />
					</div>
				) : error ? (
					<div className="flex h-[200px] items-center justify-center">
						<p className="text-destructive text-sm">
							Failed to load funnel data
						</p>
					</div>
				) : !data || data.length === 0 ? (
					<div className="flex h-[200px] items-center justify-center rounded-md border border-dashed">
						<p className="text-muted-foreground text-sm">
							No funnel data available for this period
						</p>
					</div>
				) : (
					<ChartContainer config={chartConfig} className="h-[200px] w-full">
						<BarChart
							data={data}
							layout="vertical"
							margin={{ left: 0, right: 40 }}
						>
							<XAxis type="number" hide />
							<YAxis
								type="category"
								dataKey="name"
								tickLine={false}
								axisLine={false}
								width={120}
								tick={{ fontSize: 12 }}
							/>
							<ChartTooltip
								cursor={false}
								content={
									<ChartTooltipContent
										formatter={(value, _name, item) => (
											<div className="flex flex-col gap-1">
												<span>{value.toLocaleString()} users</span>
												<span className="text-muted-foreground">
													{item.payload.conversionRate.toFixed(1)}% conversion
												</span>
											</div>
										)}
									/>
								}
							/>
							<Bar
								dataKey="count"
								fill="var(--color-count)"
								radius={[0, 4, 4, 0]}
								label={{
									position: "right",
									fontSize: 12,
									formatter: (value: number) => value.toLocaleString(),
								}}
							/>
						</BarChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}
