"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { MetricCard } from "../MetricCard";

export function CashRunwayTile() {
	const trpc = useTRPC();
	const query = useQuery(trpc.business.getCashFlow.queryOptions());
	const data = query.data;

	const description = data
		? data.available
			? `${data.runwayMonths ?? "—"} mo runway at $${data.avgMonthlyGrossBurnUsd?.toLocaleString() ?? "—"}/mo gross burn · net flow ${data.avgMonthlyNetUsd !== null && data.avgMonthlyNetUsd >= 0 ? "+" : ""}$${data.avgMonthlyNetUsd?.toLocaleString() ?? "—"}/mo avg incl. fundraise/revenue (last 3 complete months)`
			: data.reason
		: "Mercury balances across all accounts";

	return (
		<MetricCard
			className="h-full"
			title="Cash & runway (Mercury)"
			description={description}
			value={data?.available ? data.totalCashUsd : null}
			isLoading={query.isLoading}
			error={query.error}
			formatter={(v) => `$${v.toLocaleString()}`}
		/>
	);
}
