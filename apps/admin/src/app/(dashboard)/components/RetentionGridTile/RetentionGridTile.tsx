"use client";

import {
	ADMIN_INSIGHTS,
	POSTHOG_PROJECT_URL,
} from "@superset/trpc/insight-registry";
import { cn } from "@superset/ui/utils";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { InsightTileFrame } from "../InsightTileFrame";

const STALE_TIME_MS = 10 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface RetentionCohortResult {
	date: string;
	label: string;
	values: { count: number }[];
}

type CellState = "complete" | "inProgress" | "future";

function cellState(cohortStart: number, week: number, now: number): CellState {
	const weekStart = cohortStart + week * WEEK_MS;
	if (weekStart > now) return "future";
	if (weekStart + WEEK_MS > now) return "inProgress";
	return "complete";
}

function RetentionCell({
	pct,
	state,
	isFirstWeek,
}: {
	pct: number | null;
	state: CellState;
	isFirstWeek: boolean;
}) {
	if (state === "future" || pct === null) {
		return <div />;
	}
	if (state === "inProgress") {
		return (
			<div className="border-border text-muted-foreground rounded-md border border-dashed px-1 py-1.5 text-center tabular-nums">
				{pct.toFixed(1)}%
			</div>
		);
	}
	return (
		<div
			className={cn(
				"rounded-md px-1 py-1.5 text-center tabular-nums",
				(isFirstWeek || pct >= 45) && "text-white",
			)}
			style={{
				background: isFirstWeek
					? "var(--chart-1)"
					: `color-mix(in oklch, var(--chart-1) ${Math.max(8, Math.round(pct))}%, transparent)`,
			}}
		>
			{pct.toFixed(1)}%
		</div>
	);
}

// PostHog-style cohort triangle: solid chips scaled by retention, dashed
// outline for the still-in-progress cell, nothing for future weeks, and a
// size-weighted Mean row over complete cells.
export function RetentionGridTile() {
	const trpc = useTRPC();
	const query = useQuery(
		trpc.analytics.getInsightResults.queryOptions(
			{ insight: "cohortRetention" },
			{ staleTime: STALE_TIME_MS },
		),
	);

	const cohorts = Array.isArray(query.data?.result)
		? (query.data.result as RetentionCohortResult[]).filter((c) =>
				Array.isArray(c.values),
			)
		: [];
	const intervalCount = cohorts[0]?.values.length ?? 0;
	const now = Date.now();

	// Size-weighted mean per week over cohorts whose week is complete.
	const meanRow: (number | null)[] = Array.from(
		{ length: intervalCount },
		(_, week) => {
			let returned = 0;
			let weight = 0;
			for (const cohort of cohorts) {
				const size = cohort.values[0]?.count ?? 0;
				const start = new Date(cohort.date).getTime();
				if (size === 0 || cellState(start, week, now) !== "complete") continue;
				returned += cohort.values[week]?.count ?? 0;
				weight += size;
			}
			return weight > 0 ? (returned / weight) * 100 : null;
		},
	);
	const meanSize = cohorts.length
		? Math.round(
				cohorts.reduce((sum, c) => sum + (c.values[0]?.count ?? 0), 0) /
					cohorts.length,
			)
		: 0;

	return (
		<InsightTileFrame
			title={query.data?.name ?? "Cohort retention"}
			description="Weekly cohorts by first real workspace; % returning with another workspace each week"
			lastRefresh={query.data?.lastRefresh}
			isLoading={query.isLoading}
			error={query.error}
			empty={cohorts.length === 0}
			href={`${POSTHOG_PROJECT_URL}/insights/${ADMIN_INSIGHTS.cohortRetention}`}
			onRefresh={() => query.refetch()}
			isRefreshing={query.isFetching}
		>
			<div className="overflow-x-auto">
				<div
					className="grid min-w-[860px] items-center gap-1 text-xs"
					style={{
						gridTemplateColumns: `5.5rem 3rem repeat(${intervalCount}, minmax(3.5rem, 1fr))`,
					}}
				>
					<span className="text-muted-foreground">Cohort</span>
					<span className="text-muted-foreground text-right">Size</span>
					{Array.from({ length: intervalCount }, (_, week) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: columns are week offsets
							key={week}
							className="text-muted-foreground text-center"
						>
							Week {week}
						</span>
					))}

					<span className="font-medium">Mean</span>
					<span className="pr-1 text-right font-medium tabular-nums">
						{meanSize}
					</span>
					{meanRow.map((pct, week) => (
						<RetentionCell
							// biome-ignore lint/suspicious/noArrayIndexKey: columns are week offsets
							key={week}
							pct={pct}
							state={pct === null ? "future" : "complete"}
							isFirstWeek={week === 0}
						/>
					))}

					{cohorts.map((cohort) => {
						const size = cohort.values[0]?.count ?? 0;
						const start = new Date(cohort.date).getTime();
						return [
							<span
								key={`${cohort.date}-label`}
								className="text-muted-foreground whitespace-nowrap"
							>
								{new Date(cohort.date).toLocaleDateString("en-US", {
									month: "short",
									day: "numeric",
								})}
							</span>,
							<span
								key={`${cohort.date}-size`}
								className="pr-1 text-right tabular-nums"
							>
								{size}
							</span>,
							...cohort.values.map((value, week) => (
								<RetentionCell
									key={`${cohort.date}-w${String(week)}`}
									pct={size > 0 ? (value.count / size) * 100 : null}
									state={cellState(start, week, now)}
									isFirstWeek={week === 0}
								/>
							)),
						];
					})}
				</div>
			</div>
		</InsightTileFrame>
	);
}
