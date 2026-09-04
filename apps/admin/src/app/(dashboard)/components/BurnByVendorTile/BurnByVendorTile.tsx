"use client";

import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { InsightTileFrame } from "../InsightTileFrame";

// Where the money goes: average monthly outflow per counterparty over the
// last 3 complete months — the actionable half of a burn chart.
export function BurnByVendorTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const query = useQuery(trpc.business.getCashFlow.queryOptions());

	const unavailableReason =
		query.data && !query.data.available ? query.data.reason : null;
	const vendors = query.data?.available ? query.data.topVendors : [];
	const maxSpend = vendors[0]?.avgMonthlyUsd ?? 0;

	return (
		<InsightTileFrame
			title={t({
				message: "Burn by vendor (Mercury)",
			})}
			description={t({
				message: "Avg monthly outflow per counterparty, last 3 complete months",
			})}
			lastRefresh={query.data?.available ? query.data.asOf : null}
			isLoading={query.isLoading}
			error={query.error}
			empty={vendors.length === 0}
			emptyLabel={
				unavailableReason
					? t({
							message: `Unavailable: ${unavailableReason}`,
						})
					: undefined
			}
		>
			<div className="space-y-2">
				{vendors.map((vendor) => (
					<div key={vendor.name} className="flex items-center gap-2 text-xs">
						<span className="w-40 shrink-0 truncate" title={vendor.name}>
							{vendor.name}
						</span>
						<div className="bg-muted/40 h-4 flex-1 overflow-hidden rounded-sm">
							<div
								className="h-full rounded-sm"
								style={{
									width: `${maxSpend > 0 ? (vendor.avgMonthlyUsd / maxSpend) * 100 : 0}%`,
									background: "var(--chart-1)",
								}}
							/>
						</div>
						<span className="w-20 shrink-0 text-right tabular-nums">
							${vendor.avgMonthlyUsd.toLocaleString()}/mo
						</span>
					</div>
				))}
			</div>
		</InsightTileFrame>
	);
}
