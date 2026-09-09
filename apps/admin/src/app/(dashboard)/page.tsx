"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { POSTHOG_PROJECT_URL } from "@superset/trpc/insight-registry";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@superset/ui/tabs";

import { BurnByVendorTile } from "./components/BurnByVendorTile";
import { CashBalanceTile } from "./components/CashBalanceTile";
import { EnterpriseArrTile } from "./components/EnterpriseArrTile";
import { HogQLLineTile } from "./components/HogQLLineTile";
import { MrrTile } from "./components/MrrTile";
import { NetBurnTile } from "./components/NetBurnTile";
import { PaywallFunnelTile } from "./components/PaywallFunnelTile";
import { PaywallFunnelTrendTile } from "./components/PaywallFunnelTrendTile";
import { PostHogFunnelTile } from "./components/PostHogFunnelTile";
import { ProOrgsTile } from "./components/ProOrgsTile";
import { RetentionGridTile } from "./components/RetentionGridTile";
import { RunwayTile } from "./components/RunwayTile";
import { StarHistoryTile } from "./components/StarHistoryTile";
import { TrendSeriesTile } from "./components/TrendSeriesTile";

// Mirror of PostHog dashboard 1884562 (plan D-7), organized by audience:
// tiles can appear on several tabs, and growth has its own page at /growth.
// Product tiles reference saved insights by id; business tiles compute live
// from Stripe/Neon. Each tile renders at its canonical saved range (D-14).

export default function DashboardPage() {
	const { t } = useLingui();

	const DAU_PROPS = {
		insight: "dau",
		description: t({
			message: "Unique users creating a real workspace, daily",
		}),
	} as const;

	const WAU_PROPS = {
		insight: "wau",
		description: t({
			message:
				"Unique users creating a real workspace per calendar week; current week dashed",
		}),
		dashIncompleteLast: true,
	} as const;

	const ACTIVATED_RATE_PROPS = {
		insight: "activatedRate",
		description: t({
			message:
				"Real workspaces on 2+ distinct days within week 1 of first workspace (retention-validated definition)",
		}),
		xColumn: 0,
		series: [
			{
				column: 3,
				key: "activation_pct",
				label: t({
					message: "activation rate",
				}),
				kind: "line",
				suffix: "%",
			},
			{
				column: 1,
				key: "new_creators",
				label: t({
					message: "new workspace creators",
				}),
				kind: "bar",
				rightAxis: true,
			},
		],
	} as const;

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">
					<Trans>Company Metrics</Trans>
				</h1>
				<p className="text-muted-foreground">
					<Trans>
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
					</Trans>
				</p>
			</div>

			<Tabs defaultValue="company">
				<TabsList>
					<TabsTrigger value="company">
						<Trans>Company</Trans>
					</TabsTrigger>
					<TabsTrigger value="product">
						<Trans>Product</Trans>
					</TabsTrigger>
				</TabsList>

				<TabsContent value="company" className="mt-4 space-y-6">
					{/* Star growth and the paywall funnel lead: the two company
					    metrics we watch week to week that no other tile covers. */}
					<StarHistoryTile />
					<PaywallFunnelTile />
					<PaywallFunnelTrendTile />
					<CashBalanceTile />
					<div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
						<NetBurnTile />
						<RunwayTile />
						<MrrTile />
						<EnterpriseArrTile />
						<ProOrgsTile />
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
						<HogQLLineTile
							insight="workspacePercentiles"
							description={t({
								message:
									"Workspaces created per user in the last 7 days, by percentile",
							})}
							xColumn={0}
							series={[
								{
									column: 1,
									key: "workspaces",
									label: t({
										message: "workspaces",
									}),
									kind: "line",
								},
							]}
						/>
						<TrendSeriesTile
							insight="workspacesPerCreator"
							description={t({
								message:
									"Weekly p50/p90 real workspaces per creator; current week dashed",
							})}
							dashIncompleteLast
						/>
						<div className="col-span-full">
							<RetentionGridTile />
						</div>
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
