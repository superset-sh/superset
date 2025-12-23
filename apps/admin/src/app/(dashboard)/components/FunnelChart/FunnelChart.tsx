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
}: FunnelChartProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
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
					<p className="text-destructive text-sm">Failed to load funnel data</p>
				) : !data || data.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No funnel data available
					</p>
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
