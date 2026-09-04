"use client";

import { useLingui } from "@lingui/react/macro";
import { formatDateTime } from "@superset/i18n/format";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
} from "@superset/ui/chart";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Area, AreaChart, XAxis, YAxis } from "recharts";

import { useTRPC } from "@/trpc/react";

import { makeDateAxis } from "../../utils/chartAxis";
import { InsightTileFrame } from "../InsightTileFrame";
import { type MrrDatum, MrrTooltip } from "./MrrTooltip";

const RANGE_DAYS = { "7d": 7, "35d": 35, "180d": 180 } as const;
type RangeKey = keyof typeof RANGE_DAYS;

/** Matches the server's reason for "a Sigma run is in flight". */
const COMPUTING_REASON = "computing";

interface MrrSeries {
	points: { date: string; mrrUsd: number }[];
	dataLoadTime: string | null;
	dataThrough: string | null;
}

// Matches the timestamp InsightTileFrame renders in the header, so the two
// read as the same kind of fact.
const TIMESTAMP_FORMAT: Intl.DateTimeFormatOptions = {
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
};

// One daily-180d Stripe query serves every range; ranges differ only in
// sampling: 7d shows days, 35d shows 7d intervals, 180d shows month ends.
function bucketPoints(all: MrrDatum[], range: RangeKey): MrrDatum[] {
	if (range === "7d") return all.slice(-7);
	if (range === "35d") {
		const window = all.slice(-35);
		const picked: MrrDatum[] = [];
		for (let i = window.length - 1; i >= 0; i -= 7) {
			const point = window[i];
			if (point) picked.unshift(point);
		}
		return picked;
	}
	const byMonth = new Map<string, MrrDatum>();
	for (const point of all.slice(-180)) {
		byMonth.set(point.date.slice(0, 7), point);
	}
	return [...byMonth.values()];
}

export function MrrTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const chartConfig = {
		mrrUsd: {
			label: t({ message: "MRR" }),
			color: "var(--chart-1)",
		},
	} satisfies ChartConfig;
	const [range, setRange] = useState<RangeKey>("7d");
	const queryClient = useQueryClient();
	const query = useQuery(
		trpc.business.getMrr.queryOptions(undefined, {
			refetchInterval: (q) =>
				q.state.data && !q.state.data.available ? 10_000 : false,
		}),
	);
	const refresh = useMutation(
		trpc.business.refreshMrr.mutationOptions({
			// Settled rather than success: the mutation reports the run it
			// kicked, and the poll below is what lands it either way.
			onSettled: () =>
				queryClient.invalidateQueries({
					queryKey: trpc.business.getMrr.queryKey(),
				}),
		}),
	);

	const unavailableReason =
		query.data && !query.data.available ? query.data.reason : null;
	const isComputing = unavailableReason === COMPUTING_REASON;
	// Refreshing drops the cached figure, so the server answers "computing"
	// for the ~minute Sigma takes. Hold the series already on screen through
	// that rather than blanking the tile the moment someone asks to refresh
	// it. Only across "computing" — a real failure should still surface.
	const [lastSeries, setLastSeries] = useState<MrrSeries | null>(null);
	if (query.data?.available && query.data.points !== lastSeries?.points) {
		setLastSeries({
			points: query.data.points,
			dataLoadTime: query.data.dataLoadTime,
			dataThrough: query.data.dataThrough,
		});
	}
	const series = query.data?.available || isComputing ? lastSeries : null;

	// Server returns 180 daily points; range switches filter client-side.
	const days = RANGE_DAYS[range];
	const allPoints = series?.points ?? [];
	const enriched: MrrDatum[] = allPoints.map((p, i) => {
		const prev = allPoints[i - days];
		return {
			date: p.date,
			mrrUsd: p.mrrUsd,
			prevDate: prev?.date ?? null,
			prevUsd: prev?.mrrUsd ?? null,
			changePct:
				prev && prev.mrrUsd !== 0
					? ((p.mrrUsd - prev.mrrUsd) / prev.mrrUsd) * 100
					: null,
		};
	});
	const points = bucketPoints(enriched, range);
	const xAxis = makeDateAxis(points.map((point) => point.date));
	const latest = points.at(-1);
	const changePct = latest?.changePct ?? null;

	return (
		<InsightTileFrame
			title={t({ message: "MRR — daily (Stripe)" })}
			description={t({
				message:
					"Stripe's own Sigma MRR report, computed on demand via the Query Run API",
			})}
			lastRefresh={series?.dataLoadTime ?? null}
			isLoading={query.isLoading}
			onRefresh={() => refresh.mutate()}
			isRefreshing={refresh.isPending || isComputing}
			error={query.error}
			empty={points.length === 0}
			emptyLabel={
				isComputing
					? t({
							message: "Computing in Stripe — up to a minute on first load",
						})
					: unavailableReason
						? t({
								message: `Unavailable: ${unavailableReason}`,
							})
						: undefined
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
						{latest?.prevUsd !== null && latest?.prevUsd !== undefined ? (
							<p className="text-muted-foreground text-sm">
								{t({
									message: `$${latest.prevUsd.toLocaleString()} previous period (${latest.prevDate})`,
								})}
							</p>
						) : null}
						{series?.dataThrough ? (
							// Sigma's MRR table runs hours behind live, so the header's
							// refresh time is not how current the figure is. Say when the
							// data actually ends, or a correct number reads as a stale one.
							<p className="text-muted-foreground text-xs">
								{t({
									message: `Stripe data through ${formatDateTime(new Date(series.dataThrough), TIMESTAMP_FORMAT)}`,
								})}
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
							ticks={xAxis.ticks}
							tickFormatter={xAxis.tickFormatter}
						/>
						<YAxis
							tickLine={false}
							axisLine={false}
							width={56}
							domain={["auto", "auto"]}
							tickFormatter={(v: number) => `$${v.toLocaleString()}`}
						/>
						<ChartTooltip content={<MrrTooltip />} />
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
