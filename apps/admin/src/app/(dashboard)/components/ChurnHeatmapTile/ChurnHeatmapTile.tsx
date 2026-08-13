"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { InsightTileFrame } from "../InsightTileFrame";

// Cohort survival heatmap from Neon subscriptions: rows are signup months,
// columns are months since subscribing, cells are % still subscribed.
export function ChurnHeatmapTile() {
	const trpc = useTRPC();
	const query = useQuery(
		trpc.business.getChurnCohorts.queryOptions({ months: 7 }),
	);

	const rows = query.data ?? [];
	const cohorts = [...new Set(rows.map((r) => r.cohort_month))];
	const offsets = [...new Set(rows.map((r) => r.month_offset))].sort(
		(a, b) => a - b,
	);
	const cell = new Map(
		rows.map((r) => [`${r.cohort_month}:${r.month_offset}`, r]),
	);

	return (
		<InsightTileFrame
			title="Paid churn — cohort survival"
			description="% of subscriptions started each month still active k months later (Neon, enterprise excluded)"
			isLoading={query.isLoading}
			error={query.error}
			empty={rows.length === 0}
		>
			<div className="overflow-x-auto">
				<table className="w-full border-separate border-spacing-0.5 text-xs">
					<thead>
						<tr>
							<th className="text-muted-foreground pr-2 text-left font-normal">
								Cohort
							</th>
							<th className="text-muted-foreground pr-2 text-right font-normal">
								Subs
							</th>
							{offsets.map((k) => (
								<th
									key={k}
									className="text-muted-foreground min-w-10 text-center font-normal"
								>
									M{k}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{cohorts.map((cohort) => {
							const size = cell.get(`${cohort}:0`)?.cohort_size ?? 0;
							return (
								<tr key={cohort}>
									<td className="text-muted-foreground whitespace-nowrap pr-2">
										{cohort}
									</td>
									<td className="pr-2 text-right tabular-nums">{size}</td>
									{offsets.map((k) => {
										const value = cell.get(`${cohort}:${k}`);
										return (
											<td
												key={k}
												className="rounded-sm text-center tabular-nums"
												style={
													value
														? {
																backgroundColor: `color-mix(in oklch, var(--chart-1) ${Math.round(value.surviving_pct)}%, transparent)`,
															}
														: undefined
												}
											>
												{value ? `${value.surviving_pct}%` : "—"}
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
