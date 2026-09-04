"use client";

import { useLingui } from "@lingui/react/macro";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@superset/ui/chart";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";

import { useTRPC } from "@/trpc/react";

import { formatMonth } from "../../utils/chartAxis";
import { InsightTileFrame } from "../InsightTileFrame";

// Monthly gross operating outflows across all Mercury accounts (treasury
// sweeps excluded). Net flow lives on the cash card — tranche wires would
// dwarf burn on this scale. Current month is partial and rendered muted.
export function NetBurnTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const chartConfig = {
		netBurnUsd: {
			label: t({ message: "net burn" }),
			color: "var(--chart-1)",
		},
		stripeInUsd: {
			label: t({
				message: "Stripe revenue",
			}),
			color: "var(--chart-2)",
		},
	} satisfies ChartConfig;
	const query = useQuery(trpc.business.getCashFlow.queryOptions());

	const unavailableReason =
		query.data && !query.data.available ? query.data.reason : null;
	// Months before the account had outflows are pre-operating noise: they
	// produce negative "burn" that drags the axis into empty space.
	const months = (query.data?.available ? query.data.months : []).filter(
		(month) => month.outUsd > 0,
	);

	return (
		<InsightTileFrame
			title={t({
				message: "Net burn — monthly (Mercury)",
			})}
			description={t({
				message:
					"Outflows less Stripe payouts per month (treasury sweeps excluded); current month partial",
			})}
			lastRefresh={query.data?.available ? query.data.asOf : null}
			isLoading={query.isLoading}
			error={query.error}
			empty={months.length === 0}
			emptyLabel={
				unavailableReason
					? t({
							message: `Unavailable: ${unavailableReason}`,
						})
					: undefined
			}
		>
			<ChartContainer config={chartConfig} className="h-[240px] w-full">
				<BarChart data={months}>
					<XAxis
						dataKey="month"
						tickLine={false}
						axisLine={false}
						fontSize={11}
						tickFormatter={formatMonth}
					/>
					<YAxis
						tickLine={false}
						axisLine={false}
						width={64}
						// Clamp at zero: a cash-flow-positive month is a rounding
						// artifact of the partial current month, not a scale we need.
						domain={[0, "auto"]}
						tickFormatter={(v: number) => `$${v.toLocaleString()}`}
					/>
					<ChartTooltip content={<ChartTooltipContent />} />
					<Bar dataKey="netBurnUsd" radius={3}>
						{months.map((month) => (
							<Cell
								key={month.month}
								fill="color-mix(in oklch, var(--destructive) 80%, transparent)"
								opacity={month.partial ? 0.45 : 1}
							/>
						))}
					</Bar>
					<Bar dataKey="stripeInUsd" radius={3}>
						{months.map((month) => (
							<Cell
								key={`${month.month}-rev`}
								fill="var(--chart-2)"
								opacity={month.partial ? 0.45 : 1}
							/>
						))}
					</Bar>
				</BarChart>
			</ChartContainer>
		</InsightTileFrame>
	);
}
