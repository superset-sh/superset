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
import { NrrTile } from "./components/NrrTile";
import { OrgAdoptionTile } from "./components/OrgAdoptionTile";
import { PostHogFunnelTile } from "./components/PostHogFunnelTile";
import { ResetLayoutButton } from "./components/ResetLayoutButton";
import { RetentionGridTile } from "./components/RetentionGridTile";
import { StarHistoryTile } from "./components/StarHistoryTile";
import { TileSection } from "./components/TileSection";
import { TrendSeriesTile } from "./components/TrendSeriesTile";
import { TileLayoutProvider } from "./providers/TileLayoutProvider";

// Mirror of PostHog dashboard 1884562 (plan D-7), organized by audience:
// tiles can appear on several tabs, and growth has its own page at /growth.
// Product tiles reference saved insights by id; business tiles compute live
// from Stripe/Neon. Each tile renders at its canonical saved range (D-14).
//
// Tiles sit in the same draggable grid the Growth page uses, so the order and
// sizes below are the defaults, not a fixed arrangement — money first, then
// usage, then the slower-moving vanity and vendor tiles.

// Sizes are in twelfths of the row width, height included, so a half-width
// chart at 6 × 4 is 3:2 on any screen. A chart stretches to its cell, so it
// gets a height that reads well; a list or a table gets the height of its
// rows so the tile isn't half empty. Tiles that share a row want the same
// height — a row is as tall as its tallest tile, so a short tile beside a
// tall one leaves a hole under it.
const CHART_H = 4;
const LIST_H = 3;
const TABLE_H = 6;
const FUNNEL_H = 4;
const STAR_H = 6;
const FULL_W = 12;
const HALF_W = 6;

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
		<TileLayoutProvider>
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
					<div className="flex items-center justify-between gap-2">
						<TabsList>
							<TabsTrigger value="company">
								<Trans>Company</Trans>
							</TabsTrigger>
							<TabsTrigger value="product">
								<Trans>Product</Trans>
							</TabsTrigger>
						</TabsList>
						<ResetLayoutButton />
					</div>

					<TabsContent value="company" className="mt-4">
						<TileSection
							section="company"
							title={<Trans>Company</Trans>}
							description={
								<Trans>
									Revenue first, then how many people are actually using it,
									then what it costs to run.
								</Trans>
							}
							tiles={[
								{ key: "mrr", node: <MrrTile />, w: FULL_W, h: CHART_H },
								{ key: "nrr", node: <NrrTile />, w: FULL_W, h: CHART_H },
								{
									key: "dau",
									node: <TrendSeriesTile {...DAU_PROPS} />,
									w: HALF_W,
									h: CHART_H,
								},
								{
									key: "wau",
									node: <TrendSeriesTile {...WAU_PROPS} />,
									w: HALF_W,
									h: CHART_H,
								},
								{
									key: "cash",
									node: <CashBalanceTile />,
									w: FULL_W,
									h: CHART_H,
								},
								{
									key: "net-burn",
									node: <NetBurnTile />,
									w: FULL_W,
									h: CHART_H,
								},
								{
									key: "burn-by-vendor",
									node: <BurnByVendorTile />,
									w: HALF_W,
									h: LIST_H,
								},
								{
									key: "enterprise-arr",
									node: <EnterpriseArrTile />,
									w: HALF_W,
									h: LIST_H,
								},
								{
									key: "star-history",
									node: <StarHistoryTile />,
									w: FULL_W,
									h: STAR_H,
								},
							]}
						/>
					</TabsContent>

					<TabsContent value="product" className="mt-4">
						<TileSection
							section="product"
							title={<Trans>Product</Trans>}
							description={
								<Trans>
									Activation, how much people use it once they are in, and
									whether they come back.
								</Trans>
							}
							tiles={[
								{
									key: "activation-funnel",
									node: <PostHogFunnelTile />,
									w: FULL_W,
									h: FUNNEL_H,
								},
								{
									key: "dau",
									node: <TrendSeriesTile {...DAU_PROPS} />,
									w: HALF_W,
									h: CHART_H,
								},
								{
									key: "wau",
									node: <TrendSeriesTile {...WAU_PROPS} />,
									w: HALF_W,
									h: CHART_H,
								},
								{
									key: "activated-rate",
									node: <HogQLLineTile {...ACTIVATED_RATE_PROPS} />,
									w: HALF_W,
									h: CHART_H,
								},
								{
									key: "org-adoption",
									node: <OrgAdoptionTile />,
									w: HALF_W,
									h: CHART_H,
								},
								{
									key: "workspace-percentiles",
									node: (
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
									),
									w: HALF_W,
									h: CHART_H,
								},
								{
									key: "workspaces-per-creator",
									node: (
										<TrendSeriesTile
											insight="workspacesPerCreator"
											description={t({
												message:
													"Weekly p50/p90 real workspaces per creator; current week dashed",
											})}
											dashIncompleteLast
										/>
									),
									w: HALF_W,
									h: CHART_H,
								},
								{
									key: "retention",
									node: <RetentionGridTile />,
									w: FULL_W,
									h: TABLE_H,
								},
							]}
						/>
					</TabsContent>
				</Tabs>
			</div>
		</TileLayoutProvider>
	);
}
