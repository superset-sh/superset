"use client";

import { ADMIN_INSIGHTS, POSTHOG_PROJECT_URL } from "@superset/trpc";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { InsightTileFrame } from "../InsightTileFrame";

const STALE_TIME_MS = 10 * 60 * 1000;

// Renders a RetentionQuery result as the classic cohort triangle: one row per
// weekly cohort, one cell per interval, cell intensity = % of the cohort
// returning that week. A colored table, not a chart — same as PostHog.
interface RetentionCohortResult {
	date: string;
	label: string;
	values: { count: number }[];
}

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

	return (
		<InsightTileFrame
			title={query.data?.name ?? "Cohort retention"}
			description="Weekly cohorts by first real workspace; % returning with another workspace each week"
			lastRefresh={query.data?.lastRefresh}
			isLoading={query.isLoading}
			error={query.error}
			href={`${POSTHOG_PROJECT_URL}/insights/${ADMIN_INSIGHTS.cohortRetention}`}
			onRefresh={() => query.refetch()}
			isRefreshing={query.isFetching}
			empty={cohorts.length === 0}
		>
			<div className="overflow-x-auto">
				<table className="w-full border-separate border-spacing-0.5 text-xs">
					<thead>
						<tr>
							<th className="text-muted-foreground pr-2 text-left font-normal">
								Cohort
							</th>
							<th className="text-muted-foreground pr-2 text-right font-normal">
								Size
							</th>
							{Array.from({ length: intervalCount }, (_, week) => (
								<th
									// biome-ignore lint/suspicious/noArrayIndexKey: columns are week offsets
									key={week}
									className="text-muted-foreground min-w-10 text-center font-normal"
								>
									W{week}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{cohorts.map((cohort) => {
							const size = cohort.values[0]?.count ?? 0;
							return (
								<tr key={cohort.date}>
									<td className="text-muted-foreground whitespace-nowrap pr-2">
										{new Date(cohort.date).toLocaleDateString(undefined, {
											month: "short",
											day: "numeric",
										})}
									</td>
									<td className="pr-2 text-right tabular-nums">{size}</td>
									{cohort.values.map((value, week) => {
										const pct = size > 0 ? (value.count / size) * 100 : null;
										return (
											<td
												// biome-ignore lint/suspicious/noArrayIndexKey: columns are week offsets
												key={week}
												className="rounded-sm text-center tabular-nums"
												style={
													pct === null
														? undefined
														: {
																backgroundColor: `color-mix(in oklch, var(--chart-1) ${Math.round(pct)}%, transparent)`,
															}
												}
											>
												{pct === null ? "—" : `${Math.round(pct)}%`}
											</td>
										);
									})}
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</InsightTileFrame>
	);
}
