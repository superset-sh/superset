"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { MetricCard } from "../MetricCard";

export function ArpuTile() {
	const trpc = useTRPC();
	const query = useQuery(trpc.business.getArpu.queryOptions());
	const data = query.data;

	const description = data
		? data.available
			? `Sigma MRR $${data.mrrUsd.toLocaleString()} (${data.monthEnd}) ÷ ${data.activeSeats.toLocaleString()} active seats`
			: data.reason
		: "Sigma MRR ÷ active paid seats (Neon)";

	return (
		<MetricCard
			title="ARPU — per paid seat"
			description={description}
			value={data?.available ? data.arpuUsd : null}
			isLoading={query.isLoading}
			error={query.error}
			formatter={(v) => `$${v.toFixed(2)}/mo`}
		/>
	);
}
