"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { MetricCard } from "../MetricCard";

export function EnterpriseArrTile() {
	const trpc = useTRPC();
	const query = useQuery(trpc.business.getEnterpriseArr.queryOptions());
	const data = query.data;

	return (
		<MetricCard
			className="h-full"
			title="Enterprise ARR"
			description={
				data?.available
					? `${data.billedLogos} of ${data.logos} logos billed via Stripe${
							data.unbilledLogos > 0
								? ` — ${data.unbilledLogos} not yet modeled as subscriptions (revenue invisible)`
								: ""
						}`
					: (data?.reason ?? "Annualized enterprise Stripe subscriptions")
			}
			value={data?.available ? data.arrUsd : null}
			isLoading={query.isLoading}
			error={query.error}
			formatter={(v) => `$${v.toLocaleString()}/yr`}
		/>
	);
}
