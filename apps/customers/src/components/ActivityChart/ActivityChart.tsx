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
import { Bar, Cell, ComposedChart, Line, XAxis, YAxis } from "recharts";

interface ActivityPoint {
	weekStart: Date;
	activeUsers: number;
	events: number;
}

export interface ActivityChartProps {
	points: ActivityPoint[] | undefined;
	isLoading: boolean;
	error: { message: string } | null;
	headerAction?: ReactNode;
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
	eventsPartial: {
		label: "Events (week in progress)",
		color: "var(--chart-2)",
	},
} satisfies ChartConfig;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function ActivityChart({
	points,
	isLoading,
	error,
	headerAction,
}: ActivityChartProps) {
	// The last bucket is usually the current, still-running week — render it
	// as provisional (dashed) so it doesn't read as a real drop.
	const lastPoint = points?.at(-1);
	const lastIsPartial =
		lastPoint != null && lastPoint.weekStart.getTime() + WEEK_MS > Date.now();
	const lastIndex = (points?.length ?? 0) - 1;

	const chartData = (points ?? []).map((point, index) => ({
		...point,
		week: point.weekStart.toISOString(),
		// Solid line covers all complete weeks; the dashed overlay draws the
		// final segment into the in-progress week (sharing the boundary point).
		events: !lastIsPartial || index < lastIndex ? point.events : null,
		eventsPartial:
			lastIsPartial && index >= lastIndex - 1 ? point.events : null,
	}));

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle>Weekly activity</CardTitle>
						<CardDescription>
							Active members and core product events per week
							{lastIsPartial && " · current week still in progress (dashed)"}
						</CardDescription>
					</div>
					{headerAction}
				</div>
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
						<ComposedChart data={chartData} margin={{ left: 0, right: 0 }}>
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
							>
								{chartData.map((entry, index) => {
									const isPartialBar = lastIsPartial && index === lastIndex;
									return (
										<Cell
											key={entry.week}
											fillOpacity={isPartialBar ? 0.25 : 0.8}
											stroke={
												isPartialBar ? "var(--color-activeUsers)" : undefined
											}
											strokeWidth={isPartialBar ? 1.5 : 0}
											strokeDasharray={isPartialBar ? "4 3" : undefined}
										/>
									);
								})}
							</Bar>
							<Line
								yAxisId="events"
								type="monotone"
								dataKey="events"
								stroke="var(--color-events)"
								strokeWidth={2}
								dot={false}
							/>
							{lastIsPartial && (
								<Line
									yAxisId="events"
									type="monotone"
									dataKey="eventsPartial"
									stroke="var(--color-events)"
									strokeWidth={2}
									strokeDasharray="5 5"
									dot={false}
								/>
							)}
						</ComposedChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}
