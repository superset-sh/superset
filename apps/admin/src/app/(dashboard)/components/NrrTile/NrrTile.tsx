"use client";

import { useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
} from "@superset/ui/chart";
import { cn } from "@superset/ui/utils";
import { Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { useTRPC } from "@/trpc/react";

import { useSigmaMetric } from "../../hooks/useSigmaMetric";
import { formatMonth, makeDateAxis } from "../../utils/chartAxis";
import { InsightTileFrame } from "../InsightTileFrame";
import { NrrTooltip } from "./NrrTooltip";

// Matches the timestamp InsightTileFrame renders in the header, so the two
// read as the same kind of fact.
const TIMESTAMP_FORMAT: Intl.DateTimeFormatOptions = {
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
};

export function NrrTile() {
	const { formatDateTime, formatNumber } = useFormat();
	const { t } = useLingui();
	const trpc = useTRPC();
	const chartConfig = {
		nrrPct: {
			label: t({ message: "NRR" }),
			color: "var(--chart-1)",
		},
		nrrPctPartial: {
			label: t({ message: "NRR (month so far)" }),
			color: "var(--chart-1)",
		},
	} satisfies ChartConfig;
	const {
		data: series,
		isLoading,
		error,
		unavailableReason,
		isComputing,
		refresh,
		isRefreshing,
	} = useSigmaMetric({
		query: trpc.business.getNrr.queryOptions(),
		refresh: trpc.business.refreshNrr.mutationOptions(),
	});

	// The last row is the current month: the cohort's MRR today against what
	// it paid at the end of last month. Drawn dashed, like the partial week on
	// the trend tiles, and kept out of the headline.
	const currentMonth = new Date().toISOString().slice(0, 7);
	const months = series?.months ?? [];
	const lastIndex = months.length - 1;
	const lastIsPartial = months[lastIndex]?.month.slice(0, 7) === currentMonth;
	const points = months.map((m, i) => ({
		...m,
		partial: lastIsPartial && i === lastIndex,
		nrrPctSolid: lastIsPartial && i === lastIndex ? null : m.nrrPct,
		nrrPctPartial: lastIsPartial && i >= lastIndex - 1 ? m.nrrPct : null,
	}));
	const xAxis = makeDateAxis(points.map((point) => point.month));
	const latest = [...points].reverse().find((point) => !point.partial);

	return (
		<InsightTileFrame
			title={t({ message: "Net revenue retention — monthly (Stripe)" })}
			description={t({
				message:
					"MRR from customers paying at the end of the prior month, as a share of what they paid then: expansion and contraction net of churn, new customers excluded",
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
		>
			<div className="flex h-full flex-col gap-4">
				{latest ? (
					<div className="shrink-0">
						<div className="flex items-baseline gap-2">
							<span
								className={cn(
									"text-3xl font-bold",
									latest.nrrPct >= 100 ? "text-green-500" : undefined,
								)}
							>
								{latest.nrrPct.toFixed(1)}%
							</span>
							<span className="text-muted-foreground text-sm">
								{formatMonth(latest.month)}
							</span>
						</div>
						<p className="text-muted-foreground text-sm">
							{t({
								message: `$${formatNumber(latest.startMrrUsd, undefined)} from ${latest.customers} customers became $${formatNumber(latest.retainedMrrUsd, undefined)}`,
							})}
						</p>
						{series?.dataThrough ? (
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
					<LineChart data={points}>
						<XAxis
							dataKey="month"
							tickLine={false}
							axisLine={false}
							fontSize={11}
							ticks={xAxis.ticks}
							tickFormatter={xAxis.tickFormatter}
						/>
						<YAxis
							tickLine={false}
							axisLine={false}
							width={44}
							domain={["auto", "auto"]}
							tickFormatter={(v: number) => `${v}%`}
						/>
						<ReferenceLine
							y={100}
							stroke="var(--muted-foreground)"
							strokeDasharray="3 3"
						/>
						<ChartTooltip content={<NrrTooltip />} />
						<Line
							dataKey="nrrPctSolid"
							stroke="var(--color-nrrPct)"
							strokeWidth={2}
							dot={false}
							type="monotone"
						/>
						<Line
							dataKey="nrrPctPartial"
							stroke="var(--color-nrrPctPartial)"
							strokeWidth={2}
							strokeDasharray="5 5"
							dot={false}
							type="monotone"
							tooltipType="none"
						/>
					</LineChart>
				</ChartContainer>
			</div>
		</InsightTileFrame>
	);
}
