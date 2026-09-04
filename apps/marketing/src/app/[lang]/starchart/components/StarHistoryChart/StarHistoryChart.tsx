"use client";

import { useLingui } from "@lingui/react/macro";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@superset/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { formatStarCount } from "@/lib/github";
import type { StarHistoryPoint } from "../../utils/getStarHistory";
import { formatUTCDate } from "../../utils/starPace";

interface StarHistoryChartProps {
	points: StarHistoryPoint[];
	granularity: "day" | "week";
}

export function StarHistoryChart({
	points,
	granularity,
}: StarHistoryChartProps) {
	const { t } = useLingui();

	const chartConfig = {
		stars: {
			label: t({ message: "Stars" }),
			color: "var(--chart-1)",
		},
	} satisfies ChartConfig;

	const data = points.map((point) => ({
		...point,
		timestamp: new Date(point.date).getTime(),
	}));

	return (
		<ChartContainer config={chartConfig} className="h-[360px] w-full">
			<AreaChart
				data={data}
				margin={{ left: 0, right: 12, top: 12, bottom: 0 }}
			>
				<defs>
					<linearGradient id="starHistoryFill" x1="0" y1="0" x2="0" y2="1">
						<stop
							offset="0%"
							stopColor="var(--color-stars)"
							stopOpacity={0.35}
						/>
						<stop
							offset="100%"
							stopColor="var(--color-stars)"
							stopOpacity={0}
						/>
					</linearGradient>
				</defs>
				<CartesianGrid vertical={false} strokeDasharray="3 3" />
				<XAxis
					dataKey="timestamp"
					type="number"
					scale="time"
					domain={["dataMin", "dataMax"]}
					tickLine={false}
					axisLine={false}
					fontSize={11}
					minTickGap={64}
					tickFormatter={(value: number) =>
						formatUTCDate(
							value,
							granularity === "day"
								? { month: "short", day: "numeric" }
								: { month: "short", year: "numeric" },
						)
					}
				/>
				<YAxis
					tickLine={false}
					axisLine={false}
					width={48}
					fontSize={11}
					// Unlike a bar chart, a cumulative line has no reason to always
					// include zero — when zoomed into a recent window, anchoring to
					// zero would crush the visible range into a sliver at the top.
					domain={[
						(min: number) => Math.max(0, Math.floor(min * 0.95)),
						(max: number) => Math.ceil(max * 1.05),
					]}
					tickFormatter={(value: number) => formatStarCount(value)}
				/>
				<ChartTooltip
					cursor={{ stroke: "var(--border)" }}
					content={
						<ChartTooltipContent
							labelFormatter={(_, payload) => {
								const timestamp = payload?.[0]?.payload?.timestamp;
								if (typeof timestamp !== "number") return "";
								const formatted = formatUTCDate(timestamp, {
									month: "long",
									day: "numeric",
									year: "numeric",
								});
								return granularity === "week"
									? t({
											message: `Week of ${formatted}`,
										})
									: formatted;
							}}
						/>
					}
				/>
				<Area
					dataKey="stars"
					type="monotone"
					stroke="var(--color-stars)"
					strokeWidth={2}
					fill="url(#starHistoryFill)"
					dot={false}
					activeDot={{ r: 4 }}
					isAnimationActive={false}
				/>
			</AreaChart>
		</ChartContainer>
	);
}
