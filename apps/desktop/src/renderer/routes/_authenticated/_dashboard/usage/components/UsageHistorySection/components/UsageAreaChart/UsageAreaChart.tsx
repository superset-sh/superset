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
import { PROVIDER_CHART_CONFIG, PROVIDER_ORDER } from "../../constants";
import {
	formatDayLabel,
	formatTokens,
	formatUsd,
} from "../../utils/formatUsage";

type Provider = (typeof PROVIDER_ORDER)[number];

/**
 * Layered (NOT stacked) per-provider areas, each measured from zero — a
 * stacked chart permanently draws one provider above the other, which reads
 * as "that one is bigger" even on days where it is not. Clicking a day
 * selects it for inspection; providers toggle from the share rows.
 */
export function UsageAreaChart({
	history,
	metric,
	hiddenProviders,
	selectedDay,
	onSelectDay,
}: {
	history: UsageHistory;
	metric: HistoryMetric;
	hiddenProviders: ReadonlySet<Provider>;
	selectedDay: string | null;
	onSelectDay: (day: string | null) => void;
}) {
	const data = useMemo(
		() =>
			history.buckets.map((bucket) => ({
				day: bucket.day,
				claude: bucket.providers.claude?.[metric] ?? 0,
				codex: bucket.providers.codex?.[metric] ?? 0,
			})),
		[history, metric],
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
			config={PROVIDER_CHART_CONFIG}
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
											PROVIDER_CHART_CONFIG[
												name as keyof typeof PROVIDER_CHART_CONFIG
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
				{PROVIDER_ORDER.filter(
					(provider) => !hiddenProviders.has(provider),
				).map((provider) => (
					<Area
						key={provider}
						dataKey={provider}
						type="monotone"
						stroke={`var(--color-${provider})`}
						fill={`var(--color-${provider})`}
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
