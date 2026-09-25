import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@superset/ui/chart";
import { useMemo } from "react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ReferenceLine,
	XAxis,
	YAxis,
} from "recharts";
import type { UsageHistory } from "../../../../hooks/useHostUsageHistory";
import type { HistoryMetric } from "../../constants";
import { AGENT_CHART_CONFIG, AGENT_ORDER } from "../../constants";
import {
	formatDayLabel,
	formatTokens,
	formatUsd,
} from "../../utils/formatUsage";

type Agent = (typeof AGENT_ORDER)[number];

/**
 * Layered (NOT stacked) per-agent areas, each measured from zero — a
 * stacked chart permanently draws one agent above the other, which reads
 * as "that one is bigger" even on days where it is not. Clicking a day
 * selects it for inspection; agents toggle from the share rows.
 */
export function UsageAreaChart({
	history,
	metric,
	hiddenAgents,
	selectedDay,
	onSelectDay,
}: {
	history: UsageHistory;
	metric: HistoryMetric;
	hiddenAgents: ReadonlySet<Agent>;
	selectedDay: string | null;
	onSelectDay: (day: string | null) => void;
}) {
	const data = useMemo(
		() =>
			history.buckets.map((bucket) => {
				const values: Partial<Record<Agent, number>> = {};
				for (const agent of AGENT_ORDER) {
					values[agent] = bucket.agents[agent]?.[metric] ?? 0;
				}
				return { day: bucket.day, ...values };
			}),
		[history, metric],
	);

	// Agents with no usage in range draw nothing — nine flat baselines
	// would read as noise.
	const presentAgents = useMemo(
		() =>
			AGENT_ORDER.filter((agent) =>
				history.buckets.some((bucket) => bucket.agents[agent]),
			),
		[history],
	);

	const formatValue = metric === "usd" ? formatUsd : formatTokens;
	// Ticks at first / middle / last only — more labels than that just add
	// noise at this width.
	const ticks =
		data.length >= 3
			? [
					data[0]?.day,
					data[Math.floor(data.length / 2)]?.day,
					data[data.length - 1]?.day,
				].filter((d): d is string => !!d)
			: undefined;

	return (
		<ChartContainer
			config={AGENT_CHART_CONFIG}
			className="aspect-auto h-full min-h-36 w-full cursor-pointer"
		>
			<AreaChart
				data={data}
				margin={{ left: 4, right: 4, top: 4 }}
				onClick={(state) => {
					const day =
						typeof state?.activeLabel === "string" ? state.activeLabel : null;
					onSelectDay(day === selectedDay ? null : day);
				}}
			>
				<CartesianGrid vertical={false} strokeOpacity={0.35} />
				<XAxis
					dataKey="day"
					ticks={ticks}
					tickFormatter={formatDayLabel}
					tickLine={false}
					axisLine={false}
					tickMargin={8}
					className="text-[10px]"
				/>
				<YAxis
					width={44}
					tickCount={4}
					tickFormatter={(value: number) => formatValue(value)}
					tickLine={false}
					axisLine={false}
					className="text-[10px]"
				/>
				<ChartTooltip
					cursor={{ strokeDasharray: "3 3" }}
					content={
						<ChartTooltipContent
							labelFormatter={(value) => formatDayLabel(String(value))}
							formatter={(value, name, item) => (
								<>
									<span
										className="size-2 shrink-0 rounded-[2px]"
										style={{ background: item.color }}
									/>
									<span className="text-muted-foreground">
										{
											AGENT_CHART_CONFIG[
												name as keyof typeof AGENT_CHART_CONFIG
											]?.label
										}
									</span>
									<span className="ml-auto font-mono tabular-nums">
										{formatValue(Number(value))}
									</span>
								</>
							)}
						/>
					}
				/>
				{selectedDay && (
					<ReferenceLine
						x={selectedDay}
						stroke="var(--foreground)"
						strokeOpacity={0.5}
						strokeDasharray="4 3"
					/>
				)}
				{presentAgents
					.filter((agent) => !hiddenAgents.has(agent))
					.map((agent) => (
						<Area
							key={agent}
							dataKey={agent}
							type="monotone"
							stroke={`var(--color-${agent})`}
							fill={`var(--color-${agent})`}
							strokeWidth={2}
							fillOpacity={0.12}
							dot={false}
							isAnimationActive={false}
						/>
					))}
			</AreaChart>
		</ChartContainer>
	);
}
