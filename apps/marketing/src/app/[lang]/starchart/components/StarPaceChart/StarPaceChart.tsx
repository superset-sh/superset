"use client";

import { useLingui } from "@lingui/react/macro";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@superset/ui/chart";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";
import { formatStarCount } from "@/lib/github";
import type { PeriodDelta } from "../../utils/starPace";
import { formatUTCDate } from "../../utils/starPace";

interface StarPaceChartProps {
	deltas: PeriodDelta[];
	granularity: "day" | "week";
}

const GRADIENT_ID = "star-pace-partial-gradient";

export function StarPaceChart({ deltas, granularity }: StarPaceChartProps) {
	const { t } = useLingui();

	const chartConfig = {
		displayValue: {
			label: t({
				message: "New stars",
			}),
			color: "var(--chart-1)",
		},
	} satisfies ChartConfig;

	const data = deltas.map((delta) => ({
		...delta,
		timestamp: new Date(delta.date).getTime(),
		// The current period's bar grows to its projected height; a gradient
		// splits it into a solid "confirmed so far" base and a lighter
		// "projected" cap, rather than dimming the whole bar.
		displayValue: delta.isPartial ? delta.projectedTotal : delta.newStars,
	}));

	const partial = deltas.find((d) => d.isPartial);
	const confirmedPct =
		partial && partial.projectedTotal > 0
			? Math.min(
					100,
					Math.round((partial.newStars / partial.projectedTotal) * 100),
				)
			: 100;

	return (
		<ChartContainer config={chartConfig} className="h-[160px] w-full">
			<BarChart data={data} margin={{ left: 0, right: 12, top: 4, bottom: 0 }}>
				<defs>
					<linearGradient id={GRADIENT_ID} x1="0" y1="1" x2="0" y2="0">
						<stop
							offset={`${confirmedPct}%`}
							stopColor="var(--color-displayValue)"
							stopOpacity={1}
						/>
						<stop
							offset={`${confirmedPct}%`}
							stopColor="var(--color-displayValue)"
							stopOpacity={0.3}
						/>
					</linearGradient>
				</defs>
				<CartesianGrid vertical={false} strokeDasharray="3 3" />
				<XAxis
					dataKey="date"
					type="category"
					interval="preserveStartEnd"
					tickLine={false}
					axisLine={false}
					fontSize={11}
					minTickGap={64}
					tickFormatter={(value: string) =>
						formatUTCDate(
							new Date(value).getTime(),
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
					tickFormatter={(value: number) => formatStarCount(value)}
				/>
				<ChartTooltip
					cursor={{ fill: "var(--muted)" }}
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
							formatter={(_value, _name, item) => {
								const isPartial = item.payload?.isPartial;
								const actual = item.payload?.newStars;
								const projected = item.payload?.projectedTotal;
								return (
									<span className="text-foreground font-mono font-medium tabular-nums">
										{isPartial
											? t({
													message: `${actual} so far · ~${projected} projected`,
												})
											: actual}
									</span>
								);
							}}
						/>
					}
				/>
				<Bar
					dataKey="displayValue"
					radius={[3, 3, 0, 0]}
					isAnimationActive={false}
				>
					{data.map((d) => (
						<Cell
							key={d.date}
							fill={
								d.isPartial
									? `url(#${GRADIENT_ID})`
									: "var(--color-displayValue)"
							}
						/>
					))}
				</Bar>
			</BarChart>
		</ChartContainer>
	);
}
