"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@superset/ui/chart";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";

import { useTRPC } from "@/trpc/react";

import { InsightTileFrame } from "../InsightTileFrame";

const chartConfig = {
	outUsd: { label: "gross ops burn", color: "var(--chart-1)" },
} satisfies ChartConfig;

// Monthly gross operating outflows across all Mercury accounts (treasury
// sweeps excluded). Net flow lives on the cash card — tranche wires would
// dwarf burn on this scale. Current month is partial and rendered muted.
export function NetBurnTile() {
	const trpc = useTRPC();
	const query = useQuery(trpc.business.getCashFlow.queryOptions());

	const unavailableReason =
		query.data && !query.data.available ? query.data.reason : null;
	const months = query.data?.available ? query.data.months : [];

	return (
		<InsightTileFrame
			title="Gross burn — monthly (Mercury)"
			description="Operating outflows per month across all accounts (treasury sweeps excluded); current month partial"
			lastRefresh={query.data?.available ? query.data.asOf : null}
			isLoading={query.isLoading}
			error={query.error}
			empty={months.length === 0}
			emptyLabel={
				unavailableReason ? `Unavailable: ${unavailableReason}` : "No data"
			}
		>
			<ChartContainer config={chartConfig} className="h-[240px] w-full">
				<BarChart data={months}>
					<XAxis
						dataKey="month"
						tickLine={false}
						axisLine={false}
						fontSize={11}
						tickFormatter={(value: string) =>
							new Date(`${value}-01`).toLocaleDateString("en-US", {
								month: "long",
							})
						}
					/>
					<YAxis
						tickLine={false}
						axisLine={false}
						width={64}
						tickFormatter={(v: number) => `$${v.toLocaleString()}`}
					/>
					<ChartTooltip content={<ChartTooltipContent />} />
					<Bar dataKey="outUsd" radius={3}>
						{months.map((month) => (
							<Cell
								key={month.month}
								fill="color-mix(in oklch, var(--destructive) 80%, transparent)"
								opacity={month.partial ? 0.45 : 1}
							/>
						))}
					</Bar>
				</BarChart>
			</ChartContainer>
		</InsightTileFrame>
	);
}
