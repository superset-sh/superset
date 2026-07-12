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
import { Bar, ComposedChart, Line, XAxis, YAxis } from "recharts";

interface ActivityPoint {
	weekStart: Date;
	activeUsers: number;
	events: number;
}

export interface ActivityChartProps {
	points: ActivityPoint[] | undefined;
	isLoading: boolean;
	error: { message: string } | null;
}

const chartConfig = {
	activeUsers: {
		label: "Active users",
		color: "var(--chart-1)",
	},
	events: {
		label: "Events",
		color: "var(--chart-2)",
	},
} satisfies ChartConfig;

export function ActivityChart({
	points,
	isLoading,
	error,
}: ActivityChartProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Weekly activity</CardTitle>
				<CardDescription>
					Active members and core product events per week
				</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<Skeleton className="h-[220px] w-full" />
				) : error ? (
					<div className="flex h-[220px] items-center justify-center">
						<p className="text-destructive text-sm">Failed to load activity</p>
					</div>
				) : !points || points.length === 0 ? (
					<div className="flex h-[220px] items-center justify-center rounded-md border border-dashed">
						<p className="text-muted-foreground text-sm">
							No activity recorded in this window
						</p>
					</div>
				) : (
					<ChartContainer config={chartConfig} className="h-[220px] w-full">
						<ComposedChart
							data={points.map((point) => ({
								...point,
								week: point.weekStart.toISOString(),
							}))}
							margin={{ left: 0, right: 0 }}
						>
							<XAxis
								dataKey="week"
								tickLine={false}
								axisLine={false}
								tick={{ fontSize: 12 }}
								tickFormatter={(value) =>
									new Date(value).toLocaleDateString("en-US", {
										month: "short",
										day: "numeric",
									})
								}
							/>
							<YAxis yAxisId="users" hide />
							<YAxis yAxisId="events" hide />
							<ChartTooltip content={<ChartTooltipContent />} />
							<Bar
								yAxisId="users"
								dataKey="activeUsers"
								fill="var(--color-activeUsers)"
								radius={[4, 4, 0, 0]}
								fillOpacity={0.8}
							/>
							<Line
								yAxisId="events"
								type="monotone"
								dataKey="events"
								stroke="var(--color-events)"
								strokeWidth={2}
								dot={false}
							/>
						</ComposedChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}
