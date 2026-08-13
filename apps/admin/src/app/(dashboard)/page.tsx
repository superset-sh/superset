"use client";

import { POSTHOG_PROJECT_URL } from "@superset/trpc/insight-registry";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { ChurnHeatmapTile } from "./components/ChurnHeatmapTile";
import { HogQLLineTile } from "./components/HogQLLineTile";
import { LogoRetentionTile } from "./components/LogoRetentionTile";
import { MetricCard } from "./components/MetricCard";
import { MrrTile } from "./components/MrrTile";
import { PostHogFunnelTile } from "./components/PostHogFunnelTile";
import { RetentionGridTile } from "./components/RetentionGridTile";
import { SignupToPaidTile } from "./components/SignupToPaidTile";
import { TrendSeriesTile } from "./components/TrendSeriesTile";

// One-to-one mirror of PostHog dashboard 1884562 (plan D-7): Product tiles
// reference the saved insights by id; Business tiles compute live from
// Stripe Sigma and Neon. Each tile renders at its canonical saved range —
// range changes are definition changes and happen in PostHog (D-14).
export default function DashboardPage() {
	const trpc = useTRPC();
	const enterpriseArr = useQuery(trpc.business.getEnterpriseArr.queryOptions());

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">Company Metrics</h1>
				<p className="text-muted-foreground">
					Mirror of the{" "}
					<a
						href={`${POSTHOG_PROJECT_URL}/dashboard/1884562`}
						target="_blank"
						rel="noreferrer"
						className="underline underline-offset-2"
					>
						PostHog Success Metrics dashboard
					</a>{" "}
					— product via saved insights, business live from Stripe/Neon
				</p>
			</div>

			<h2 className="text-muted-foreground pt-2 text-sm font-medium uppercase tracking-wide">
				Product
			</h2>

			<PostHogFunnelTile />

			<div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
				<TrendSeriesTile
					insight="dauWau"
					description="Unique users creating a real workspace: daily, plus rolling-7d WAU"
				/>
				<HogQLLineTile
					insight="activatedRate"
					description="Real workspaces on 2+ distinct days within week 1 of first workspace (retention-validated definition)"
					xColumn={0}
					series={[
						{
							column: 3,
							key: "activation_pct",
							label: "activation rate",
							kind: "line",
							suffix: "%",
						},
						{
							column: 1,
							key: "new_creators",
							label: "new workspace creators",
							kind: "bar",
							rightAxis: true,
						},
					]}
				/>
				<HogQLLineTile
					insight="activeOrgs"
					description="Weekly orgs with 2+/5+ members creating real workspaces"
					xColumn={0}
					series={[
						{
							column: 1,
							key: "orgs_2plus",
							label: "orgs with 2+ active members",
							kind: "line",
						},
						{
							column: 2,
							key: "orgs_5plus",
							label: "orgs with 5+ active members",
							kind: "line",
						},
					]}
				/>
				<HogQLLineTile
					insight="workspacePercentiles"
					description="Workspaces created per user in the last 7 days, by percentile"
					xColumn={0}
					series={[
						{ column: 1, key: "workspaces", label: "workspaces", kind: "line" },
					]}
				/>
				<TrendSeriesTile
					insight="workspacesPerCreator"
					description="Weekly p50/p90 real workspaces per creator"
				/>
				<TrendSeriesTile
					insight="newSiteVisitors"
					description="First-ever pageview on superset.sh, daily"
				/>
				<TrendSeriesTile
					insight="downloadCtrMac"
					description="Weekly pageview → download conversion, Mac visitors"
					valueSuffix="%"
				/>
			</div>

			<RetentionGridTile />

			<h2 className="text-muted-foreground pt-2 text-sm font-medium uppercase tracking-wide">
				Business
			</h2>

			<div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
				<MrrTile />
				<LogoRetentionTile />
				<SignupToPaidTile />
				<div className="space-y-6">
					<MetricCard
						title="Enterprise ARR"
						description={
							enterpriseArr.data?.available
								? `${enterpriseArr.data.billedLogos} of ${enterpriseArr.data.logos} logos billed via Stripe${
										enterpriseArr.data.unbilledLogos > 0
											? ` — ${enterpriseArr.data.unbilledLogos} not yet modeled as subscriptions (revenue invisible)`
											: ""
									}`
								: (enterpriseArr.data?.reason ??
									"Annualized enterprise Stripe subscriptions")
						}
						value={
							enterpriseArr.data?.available ? enterpriseArr.data.arrUsd : null
						}
						isLoading={enterpriseArr.isLoading}
						error={enterpriseArr.error}
						formatter={(v) => `$${v.toLocaleString()}/yr`}
					/>
				</div>
			</div>

			<ChurnHeatmapTile />
		</div>
	);
}
