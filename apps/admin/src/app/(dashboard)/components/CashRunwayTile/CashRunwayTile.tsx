"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { MetricCard } from "../MetricCard";

// Runway-style headline stats: cash, gross burn, runway — one query,
// three cards.
export function CashRunwayTile() {
	const trpc = useTRPC();
	const query = useQuery(trpc.business.getCashFlow.queryOptions());
	const data = query.data;
	const available = data?.available === true;
	const reason = data && !data.available ? data.reason : undefined;

	return (
		<div className="grid grid-cols-1 gap-6 md:grid-cols-3">
			<MetricCard
				title="Cash"
				description={reason ?? "All Mercury accounts + Treasury"}
				value={available ? data.totalCashUsd : null}
				isLoading={query.isLoading}
				error={query.error}
				formatter={(v) => `$${(v / 1_000_000).toFixed(2)}M`}
			/>
			<MetricCard
				title="Gross burn"
				description={reason ?? "Avg monthly outflows, last 3 complete months"}
				value={available ? data.avgMonthlyGrossBurnUsd : null}
				isLoading={query.isLoading}
				error={query.error}
				formatter={(v) => `$${v.toLocaleString()}/mo`}
			/>
			<MetricCard
				title="Runway"
				description={
					reason ??
					`Cash ÷ gross burn${
						available && data.avgMonthlyNetUsd !== null
							? ` · net flow ${data.avgMonthlyNetUsd >= 0 ? "+" : ""}$${data.avgMonthlyNetUsd.toLocaleString()}/mo incl. wires`
							: ""
					}`
				}
				value={available ? data.runwayMonths : null}
				isLoading={query.isLoading}
				error={query.error}
				formatter={(v) => `${v.toLocaleString()} mo`}
			/>
		</div>
	);
}
