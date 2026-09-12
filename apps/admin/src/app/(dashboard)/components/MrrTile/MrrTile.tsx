"use client";

import { useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
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
import { useState } from "react";
import { Area, AreaChart, XAxis, YAxis } from "recharts";

import { useTRPC } from "@/trpc/react";

import { useSigmaMetric } from "../../hooks/useSigmaMetric";
import { makeDateAxis } from "../../utils/chartAxis";
import { InsightTileFrame } from "../InsightTileFrame";
import { type MrrDatum, MrrTooltip } from "./MrrTooltip";

const RANGE_DAYS = { "7d": 7, "35d": 35, "180d": 180 } as const;
type RangeKey = keyof typeof RANGE_DAYS;

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
	const { formatDateTime, formatNumber } = useFormat();

	const { t } = useLingui();
	const trpc = useTRPC();
	const chartConfig = {
		mrrUsd: {
			label: t({ message: "MRR" }),
			color: "var(--chart-1)",
		},
	} satisfies ChartConfig;
	const [range, setRange] = useState<RangeKey>("7d");
	const {
		data: series,
		isLoading,
		error,
		unavailableReason,
		isComputing,
		refresh,
		isRefreshing,
	} = useSigmaMetric({
		query: trpc.business.getMrr.queryOptions(),
		refresh: trpc.business.refreshMrr.mutationOptions(),
	});

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
			fill
			isLoading={isLoading}
			onRefresh={refresh}
			isRefreshing={isRefreshing}
			error={error}
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
			{/* A column with a definite height: the chart's h-full has nothing to
			    resolve against inside an auto-height wrapper, and recharts renders
			    no svg at all when it measures zero. */}
			<div className="flex h-full flex-col gap-4">
				{latest ? (
					<div className="shrink-0">
						<div className="flex items-baseline gap-2">
							<span className="text-3xl font-bold">
								${formatNumber(latest.mrrUsd, undefined)}
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
									message: `$${formatNumber(latest.prevUsd, undefined)} previous period (${latest.prevDate})`,
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
				<ChartContainer
					config={chartConfig}
					className="aspect-auto w-full flex-1 min-h-[160px]"
				>
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
							tickFormatter={(v: number) => `$${formatNumber(v, undefined)}`}
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
