"use client";

import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { MetricCard } from "../MetricCard";

// Runway headline. Cash and burn have their own charts, so this card
// carries just the derived number plus the inputs it came from.
export function RunwayTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const query = useQuery(trpc.business.getCashFlow.queryOptions());
	const data = query.data;
	const available = data?.available === true;

	const description = available
		? t({
				message: `$${(data.totalCashUsd / 1_000_000).toFixed(2)}M cash ÷ $${data.avgMonthlyNetBurnUsd?.toLocaleString() ?? "—"}/mo net burn, last 3 complete months. Cash includes raised capital; no growth assumed.`,
			})
		: ((data && !data.available ? data.reason : null) ??
			t({
				message: "Cash ÷ net burn at the current run rate",
			}));

	return (
		<MetricCard
			className="h-full"
			title={t({ message: "Runway" })}
			description={description}
			value={available ? data.runwayMonths : null}
			isLoading={query.isLoading}
			error={query.error}
			formatter={(v) => t({ message: `${v.toLocaleString()} mo` })}
		/>
	);
}
