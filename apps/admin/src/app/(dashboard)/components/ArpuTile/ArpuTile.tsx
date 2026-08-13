"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { MetricCard } from "../MetricCard";

export function ArpuTile() {
	const trpc = useTRPC();
	const query = useQuery(
		trpc.business.getArpu.queryOptions(undefined, {
			refetchInterval: (q) =>
				q.state.data && !q.state.data.available ? 10_000 : false,
		}),
	);
	const data = query.data;

	const description = data
		? data.available
			? `MRR $${data.mrrUsd.toLocaleString()} ÷ ${data.payingOrgs.toLocaleString()} paying orgs · $${data.perSeatUsd?.toFixed(2) ?? "—"}/seat across ${data.activeSeats.toLocaleString()} seats (${data.asOf})`
			: data.reason === "computing"
				? "Waiting for the MRR query…"
				: data.reason
		: "Sigma MRR ÷ paying orgs (Neon)";

	return (
		<MetricCard
			title="ARPA — per paying org"
			description={description}
			value={data?.available ? data.arpaUsd : null}
			isLoading={query.isLoading}
			error={query.error}
			formatter={(v) => `$${v.toFixed(2)}/mo`}
		/>
	);
}
