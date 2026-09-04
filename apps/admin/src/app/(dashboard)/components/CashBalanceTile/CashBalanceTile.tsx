"use client";

import { useLingui } from "@lingui/react/macro";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@superset/ui/chart";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, XAxis, YAxis } from "recharts";

import { useTRPC } from "@/trpc/react";

import { makeDateAxis } from "../../utils/chartAxis";
import { InsightTileFrame } from "../InsightTileFrame";

// Total cash across all Mercury accounts + Treasury, reconstructed from the
// transaction history. Tranche wires show as steps up; burn as gentle slope.
export function CashBalanceTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const chartConfig = {
		cashUsd: {
			label: t({
				message: "total cash",
			}),
			color: "var(--chart-2)",
		},
	} satisfies ChartConfig;
	const query = useQuery(trpc.business.getCashFlow.queryOptions());

	const unavailableReason =
		query.data && !query.data.available ? query.data.reason : null;
	const points = query.data?.available ? query.data.cashSeries : [];
	const xAxis = makeDateAxis(points.map((point) => point.date));

	return (
		<InsightTileFrame
			title={t({
				message: "Cash — total balance (Mercury)",
			})}
			description={t({
				message:
					"Checking + savings + Treasury over time; fundraise tranches are the steps",
			})}
			lastRefresh={query.data?.available ? query.data.asOf : null}
			isLoading={query.isLoading}
			error={query.error}
			empty={points.length === 0}
			emptyLabel={
				unavailableReason
					? t({
							message: `Unavailable: ${unavailableReason}`,
						})
					: undefined
			}
		>
			<ChartContainer config={chartConfig} className="h-[240px] w-full">
				<AreaChart data={points}>
					<XAxis
						dataKey="date"
						tickLine={false}
						axisLine={false}
						fontSize={11}
						ticks={xAxis.ticks}
						tickFormatter={xAxis.tickFormatter}
					/>
					<YAxis
						tickLine={false}
						axisLine={false}
						width={64}
						tickFormatter={(v: number) => `$${(v / 1_000_000).toFixed(1)}M`}
					/>
					<ChartTooltip content={<ChartTooltipContent />} />
					<Area
						dataKey="cashUsd"
						stroke="var(--color-cashUsd)"
						fill="var(--color-cashUsd)"
						fillOpacity={0.15}
						strokeWidth={2}
						type="stepAfter"
					/>
				</AreaChart>
			</ChartContainer>
		</InsightTileFrame>
	);
}
