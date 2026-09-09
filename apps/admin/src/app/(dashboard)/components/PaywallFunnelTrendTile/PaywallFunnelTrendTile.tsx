"use client";

import { useLingui } from "@lingui/react/macro";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@superset/ui/chart";
import { Bar, ComposedChart, Line, XAxis, YAxis } from "recharts";

import { usePaywallFunnel } from "../../hooks/usePaywallFunnel";
import { makeDateAxis } from "../../utils/chartAxis";
import { InsightTileFrame } from "../InsightTileFrame";

function rate(part: number, whole: number): number {
	if (whole === 0) return 0;
	return Math.round((part / whole) * 1000) / 10;
}

export function PaywallFunnelTrendTile() {
	const { t } = useLingui();
	const query = usePaywallFunnel();

	const chartConfig = {
		upgrade_pct: {
			label: t({ message: "view → upgrade click" }),
			color: "var(--chart-1)",
		},
		paid_pct: {
			label: t({ message: "view → paid" }),
			color: "var(--chart-2)",
		},
		paywall_viewed: {
			label: t({ message: "cohort size" }),
			color: "var(--chart-3)",
		},
	} satisfies ChartConfig;

	const data = (query.data?.weekly ?? []).map((week) => ({
		week: week.week,
		paywall_viewed: week.paywallViewed,
		upgrade_pct: rate(week.upgradeClicked, week.paywallViewed),
		paid_pct: rate(week.paid, week.paywallViewed),
	}));
	const xAxis = makeDateAxis(data.map((row) => row.week));

	return (
		<InsightTileFrame
			title={t({ message: "Paywall conversion over time" })}
			description={t({
				message:
					"Weekly cohorts by first paywall view. Bars are cohort size; the current week is still filling.",
			})}
			isLoading={query.isLoading}
			error={query.error}
			empty={data.length === 0}
		>
			<ChartContainer config={chartConfig} className="h-[240px] w-full">
				<ComposedChart data={data}>
					<XAxis
						dataKey="week"
						tickLine={false}
						axisLine={false}
						fontSize={11}
						ticks={xAxis.ticks}
						tickFormatter={xAxis.tickFormatter}
					/>
					<YAxis
						yAxisId="left"
						tickLine={false}
						axisLine={false}
						width={44}
						fontSize={11}
						tickFormatter={(value: number) => `${value}%`}
					/>
					<YAxis yAxisId="right" orientation="right" hide />
					<ChartTooltip content={<ChartTooltipContent />} />
					<Bar
						dataKey="paywall_viewed"
						yAxisId="right"
						fill="var(--color-paywall_viewed)"
						opacity={0.35}
						radius={2}
					/>
					<Line
						dataKey="upgrade_pct"
						yAxisId="left"
						stroke="var(--color-upgrade_pct)"
						strokeWidth={2}
						dot={false}
						type="monotone"
					/>
					<Line
						dataKey="paid_pct"
						yAxisId="left"
						stroke="var(--color-paid_pct)"
						strokeWidth={2}
						dot={false}
						type="monotone"
					/>
				</ComposedChart>
			</ChartContainer>
		</InsightTileFrame>
	);
}
