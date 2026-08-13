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
				title="Net burn"
				description={
					reason ??
					(available && data.avgMonthlyGrossBurnUsd !== null
						? `$${data.avgMonthlyGrossBurnUsd.toLocaleString()}/mo out less Stripe payouts, last 3 complete months`
						: "Outflows less Stripe revenue, last 3 complete months")
				}
				value={available ? data.avgMonthlyNetBurnUsd : null}
				isLoading={query.isLoading}
				error={query.error}
				formatter={(v) => `$${v.toLocaleString()}/mo`}
			/>
			<MetricCard
				title="Runway"
				description={
					reason ??
					"Cash ÷ net burn; enterprise wires not netted (indistinguishable from investor wires)"
				}
				value={available ? data.runwayMonths : null}
				isLoading={query.isLoading}
				error={query.error}
				formatter={(v) => `${v.toLocaleString()} mo`}
			/>
		</div>
	);
}
