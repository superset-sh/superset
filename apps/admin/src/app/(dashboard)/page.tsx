"use client";

import { POSTHOG_PROJECT_URL } from "@superset/trpc/insight-registry";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superset/ui/tabs";

import { BurnByVendorTile } from "./components/BurnByVendorTile";
import { CashBalanceTile } from "./components/CashBalanceTile";
import { ChurnHeatmapTile } from "./components/ChurnHeatmapTile";
import { EnterpriseArrTile } from "./components/EnterpriseArrTile";
import { HogQLLineTile } from "./components/HogQLLineTile";
import { LogoRetentionTile } from "./components/LogoRetentionTile";
import { MrrTile } from "./components/MrrTile";
import { NetBurnTile } from "./components/NetBurnTile";
import { PostHogFunnelTile } from "./components/PostHogFunnelTile";
import { RetentionGridTile } from "./components/RetentionGridTile";
import { RunwayTile } from "./components/RunwayTile";
import { SignupToPaidTile } from "./components/SignupToPaidTile";
import { TrendSeriesTile } from "./components/TrendSeriesTile";

// Mirror of PostHog dashboard 1884562 (plan D-7), organized by audience:
// tiles can appear on several tabs. Product tiles reference saved insights
// by id; business tiles compute live from Stripe/Neon. Each tile renders at
// its canonical saved range (D-14).

const DAU_PROPS = {
	insight: "dau",
	description: "Unique users creating a real workspace, daily",
} as const;

const WAU_PROPS = {
	insight: "wau",
	description:
		"Unique users creating a real workspace per calendar week; current week dashed",
	dashIncompleteLast: true,
} as const;

const ACTIVATED_RATE_PROPS = {
	insight: "activatedRate",
	description:
		"Real workspaces on 2+ distinct days within week 1 of first workspace (retention-validated definition)",
	xColumn: 0,
	series: [
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
	],
} as const;

const ACTIVE_ORGS_PROPS = {
	insight: "activeOrgs",
	description: "Weekly orgs with 2+/5+ members creating real workspaces",
	xColumn: 0,
	series: [
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
	],
} as const;

export default function DashboardPage() {
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

			<Tabs defaultValue="company">
				<TabsList>
					<TabsTrigger value="company">Company</TabsTrigger>
					<TabsTrigger value="product">Product</TabsTrigger>
					<TabsTrigger value="growth">Growth</TabsTrigger>
				</TabsList>

				<TabsContent value="company" className="mt-4 space-y-6">
					<CashBalanceTile />
					<div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
						<NetBurnTile />
						<RunwayTile />
						<MrrTile />
						<EnterpriseArrTile />
						<TrendSeriesTile {...WAU_PROPS} />
						<TrendSeriesTile {...DAU_PROPS} />
						<div className="xl:col-span-2">
							<BurnByVendorTile />
						</div>
					</div>
				</TabsContent>

				<TabsContent value="product" className="mt-4">
					<div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
						<div className="col-span-full">
							<PostHogFunnelTile />
						</div>
						<TrendSeriesTile {...DAU_PROPS} />
						<TrendSeriesTile {...WAU_PROPS} />
						<HogQLLineTile {...ACTIVATED_RATE_PROPS} />
						<HogQLLineTile {...ACTIVE_ORGS_PROPS} />
						<HogQLLineTile
							insight="workspacePercentiles"
							description="Workspaces created per user in the last 7 days, by percentile"
							xColumn={0}
							series={[
								{
									column: 1,
									key: "workspaces",
									label: "workspaces",
									kind: "line",
								},
							]}
						/>
						<TrendSeriesTile
							insight="workspacesPerCreator"
							description="Weekly p50/p90 real workspaces per creator; current week dashed"
							dashIncompleteLast
						/>
						<div className="col-span-full">
							<RetentionGridTile />
						</div>
					</div>
				</TabsContent>

				<TabsContent value="growth" className="mt-4">
					<div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
						<div className="col-span-full">
							<PostHogFunnelTile />
						</div>
						<TrendSeriesTile
							insight="newSiteVisitors"
							description="First-ever pageview on superset.sh, daily"
						/>
						<TrendSeriesTile
							insight="downloadCtrMac"
							description="Weekly pageview → download conversion, Mac visitors; current week dashed"
							valueSuffix="%"
							dashIncompleteLast
						/>
						<SignupToPaidTile />
						<HogQLLineTile {...ACTIVATED_RATE_PROPS} />
						<MrrTile />
						<LogoRetentionTile />
						<div className="col-span-full">
							<ChurnHeatmapTile />
						</div>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
