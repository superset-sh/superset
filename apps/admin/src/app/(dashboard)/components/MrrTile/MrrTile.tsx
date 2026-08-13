"use client";

import { Button } from "@superset/ui/button";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@superset/ui/chart";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Area, AreaChart, XAxis, YAxis } from "recharts";

import { useTRPC } from "@/trpc/react";

import { InsightTileFrame } from "../InsightTileFrame";

const chartConfig = {
	mrrUsd: { label: "MRR", color: "var(--chart-1)" },
} satisfies ChartConfig;

const RANGES = [
	{ label: "7d", days: 7 },
	{ label: "35d", days: 35 },
	{ label: "180d", days: 180 },
] as const;

export function MrrTile() {
	const trpc = useTRPC();
	const [rangeDays, setRangeDays] = useState<7 | 35 | 180>(7);
	const query = useQuery(
		trpc.business.getMrr.queryOptions(undefined, {
			refetchInterval: (q) =>
				q.state.data && !q.state.data.available ? 10_000 : false,
		}),
	);

	const unavailableReason =
		query.data && !query.data.available ? query.data.reason : null;
	// Server returns 180 daily points; range switches filter client-side.
	const allPoints = query.data?.available ? query.data.points : [];
	const points = allPoints.slice(-rangeDays);
	const latest = points.at(-1);
	const first = points[0];
	const delta =
		latest && first ? Math.round(latest.mrrUsd - first.mrrUsd) : null;

	return (
		<InsightTileFrame
			title="MRR — daily (Stripe)"
			description={
				latest
					? `$${latest.mrrUsd.toLocaleString()} (${latest.date})${delta !== null ? ` · ${delta >= 0 ? "+" : "−"}$${Math.abs(delta).toLocaleString()} over ${rangeDays}d` : ""} — Stripe's own Sigma MRR report`
					: "Stripe's own Sigma MRR report, computed on demand via the Query Run API"
			}
			lastRefresh={query.data?.available ? query.data.dataLoadTime : null}
			isLoading={query.isLoading}
			error={query.error}
			empty={points.length === 0}
			emptyLabel={
				unavailableReason === "computing"
					? "Computing in Stripe — up to a minute on first load"
					: unavailableReason
						? `Unavailable: ${unavailableReason}`
						: "No data"
			}
			headerAction={
				<div className="flex shrink-0 gap-1">
					{RANGES.map((range) => (
						<Button
							key={range.label}
							size="sm"
							variant={rangeDays === range.days ? "secondary" : "ghost"}
							className="h-6 px-2 text-xs"
							onClick={() => setRangeDays(range.days)}
						>
							{range.label}
						</Button>
					))}
				</div>
			}
		>
			<ChartContainer config={chartConfig} className="h-[240px] w-full">
				<AreaChart data={points}>
					<XAxis
						dataKey="date"
						tickLine={false}
						axisLine={false}
						fontSize={11}
					/>
					<YAxis
						tickLine={false}
						axisLine={false}
						width={56}
						domain={["auto", "auto"]}
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
