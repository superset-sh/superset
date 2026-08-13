"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@superset/ui/chart";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, XAxis, YAxis } from "recharts";

import { useTRPC } from "@/trpc/react";

import { InsightTileFrame } from "../InsightTileFrame";

const chartConfig = {
	mrrUsd: { label: "MRR", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function MrrTile() {
	const trpc = useTRPC();
	const query = useQuery(trpc.business.getMrr.queryOptions());

	const unavailableReason =
		query.data && !query.data.available ? query.data.reason : null;
	const points = query.data?.available ? query.data.points : [];
	const latest = points.at(-1);

	return (
		<InsightTileFrame
			title="MRR — monthly (Stripe)"
			description={
				latest
					? `Latest: $${latest.mrrUsd.toLocaleString()} (${latest.monthEnd}) — Stripe's own Sigma MRR report`
					: 'Stripe\'s own Sigma MRR report (scheduled query "admin-mrr")'
			}
			lastRefresh={query.data?.available ? query.data.dataLoadTime : null}
			isLoading={query.isLoading}
			error={query.error}
			empty={points.length === 0}
			emptyLabel={
				unavailableReason
					? `Unavailable: ${unavailableReason}. Enable Sigma and schedule the MRR template daily as "admin-mrr".`
					: "No data"
			}
		>
			<ChartContainer config={chartConfig} className="h-[240px] w-full">
				<AreaChart data={points}>
					<XAxis
						dataKey="monthEnd"
						tickLine={false}
						axisLine={false}
						fontSize={11}
					/>
					<YAxis
						tickLine={false}
						axisLine={false}
						width={56}
						tickFormatter={(v: number) => `$${v.toLocaleString()}`}
					/>
					<ChartTooltip content={<ChartTooltipContent />} />
					<Area
						dataKey="mrrUsd"
						stroke="var(--color-mrrUsd)"
						fill="var(--color-mrrUsd)"
						fillOpacity={0.15}
						strokeWidth={2}
						type="monotone"
					/>
				</AreaChart>
			</ChartContainer>
		</InsightTileFrame>
	);
}
