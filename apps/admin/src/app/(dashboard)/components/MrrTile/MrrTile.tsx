"use client";

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@superset/ui/chart";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { cn } from "@superset/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Area, AreaChart, XAxis, YAxis } from "recharts";

import { useTRPC } from "@/trpc/react";

import { InsightTileFrame } from "../InsightTileFrame";

const chartConfig = {
	mrrUsd: { label: "MRR", color: "var(--chart-1)" },
} satisfies ChartConfig;

const RANGE_DAYS = { "7d": 7, "35d": 35, "180d": 180 } as const;
type RangeKey = keyof typeof RANGE_DAYS;

export function MrrTile() {
	const trpc = useTRPC();
	const [range, setRange] = useState<RangeKey>("7d");
	const query = useQuery(
		trpc.business.getMrr.queryOptions(undefined, {
			refetchInterval: (q) =>
				q.state.data && !q.state.data.available ? 10_000 : false,
		}),
	);

	const unavailableReason =
		query.data && !query.data.available ? query.data.reason : null;
	// Server returns 180 daily points; range switches filter client-side.
	const days = RANGE_DAYS[range];
	const allPoints = query.data?.available ? query.data.points : [];
	const points = allPoints.slice(-days);
	const latest = points.at(-1);
	// Previous period = the value exactly one range-length before the latest
	// point (Stripe's "previous period" comparison), falling back to the
	// oldest point we have.
	const previous =
		allPoints.at(-1 - days) ?? (points.length > 1 ? points[0] : undefined);
	const changePct =
		latest && previous && previous.mrrUsd !== 0
			? ((latest.mrrUsd - previous.mrrUsd) / previous.mrrUsd) * 100
			: null;

	return (
		<InsightTileFrame
			title="MRR — daily (Stripe)"
			description="Stripe's own Sigma MRR report, computed on demand via the Query Run API"
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
				<Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
					<SelectTrigger size="sm" className="h-7 w-[76px] text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{Object.keys(RANGE_DAYS).map((key) => (
							<SelectItem key={key} value={key}>
								{key}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			}
		>
			<div className="space-y-4">
				{latest ? (
					<div>
						<div className="flex items-baseline gap-2">
							<span className="text-3xl font-bold">
								${latest.mrrUsd.toLocaleString()}
							</span>
							{changePct !== null ? (
								<span
									className={cn(
										"text-sm font-medium",
										changePct >= 0 ? "text-green-500" : "text-red-500",
									)}
								>
									{changePct >= 0 ? "+" : ""}
									{changePct.toFixed(2)}%
								</span>
							) : null}
						</div>
						{previous ? (
							<p className="text-muted-foreground text-sm">
								${previous.mrrUsd.toLocaleString()} previous period (
								{previous.date})
							</p>
						) : null}
					</div>
				) : null}
				<ChartContainer config={chartConfig} className="h-[200px] w-full">
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
			</div>
		</InsightTileFrame>
	);
}
