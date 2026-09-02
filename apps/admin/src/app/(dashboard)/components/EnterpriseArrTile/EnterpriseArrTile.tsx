"use client";

import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { InsightTileFrame } from "../InsightTileFrame";

function initials(name: string): string {
	return name
		.split(/\s+/)
		.slice(0, 2)
		.map((word) => word[0]?.toUpperCase() ?? "")
		.join("");
}

// Enterprise accounts with their contracted ARR: names and logos from Neon,
// money from Stripe subscriptions. Unbilled deals stay visible so revenue
// that exists only on paper can't hide.
export function EnterpriseArrTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const query = useQuery(trpc.business.getEnterpriseArr.queryOptions());
	const data = query.data;

	const accounts = data?.available ? data.accounts : [];
	const maxArr = accounts[0]?.arrUsd ?? 0;

	return (
		<InsightTileFrame
			title={t({
				message: "Enterprise ARR by account",
			})}
			description={
				data?.available
					? t({
							message: `$${data.arrUsd.toLocaleString()}/yr across ${accounts.length} logos — already inside MRR, not additive`,
						}) +
						(data.unbilledLogos > 0
							? t({
									message: `. ${data.unbilledLogos} not yet modeled as Stripe subscriptions`,
								})
							: "")
					: (data?.reason ??
						t({
							message: "Annualized enterprise Stripe subscriptions",
						}))
			}
			isLoading={query.isLoading}
			error={query.error}
			empty={accounts.length === 0}
			emptyLabel={t({
				message: "No active enterprise accounts",
			})}
		>
			<div className="space-y-3">
				{accounts.map((account) => (
					<div key={account.name} className="flex items-center gap-3">
						{account.logo ? (
							// biome-ignore lint/performance/noImgElement: arbitrary remote logo hosts
							<img
								src={account.logo}
								alt=""
								className="size-8 shrink-0 rounded-md object-cover"
							/>
						) : (
							<div className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-medium">
								{initials(account.name)}
							</div>
						)}
						<div className="min-w-0 flex-1">
							<div className="flex items-baseline justify-between gap-3">
								<span className="truncate text-sm font-medium">
									{account.name}
								</span>
								<span className="shrink-0 text-sm tabular-nums">
									{account.billed
										? `$${account.arrUsd.toLocaleString()}/yr`
										: t({
												message: "unbilled",
											})}
								</span>
							</div>
							<div className="bg-muted/40 mt-1 h-1.5 overflow-hidden rounded-full">
								<div
									className="h-full rounded-full"
									style={{
										width: `${maxArr > 0 ? (account.arrUsd / maxArr) * 100 : 0}%`,
										background: account.billed
											? "var(--chart-1)"
											: "var(--muted-foreground)",
									}}
								/>
							</div>
						</div>
					</div>
				))}
			</div>
		</InsightTileFrame>
	);
}
