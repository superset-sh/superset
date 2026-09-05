"use client";

import { Trans, useLingui } from "@lingui/react/macro";

import { ChurnHeatmapTile } from "../components/ChurnHeatmapTile";
import { HogQLLineTile } from "../components/HogQLLineTile";
import { LogoRetentionTile } from "../components/LogoRetentionTile";
import { MrrTile } from "../components/MrrTile";
import { PostHogFunnelTile } from "../components/PostHogFunnelTile";
import { SignupToPaidTile } from "../components/SignupToPaidTile";
import { TrendSeriesTile } from "../components/TrendSeriesTile";
import { AiAgentsTile } from "./components/AiAgentsTile";
import { AiReferralsTile } from "./components/AiReferralsTile";
import { ChannelMixTile } from "./components/ChannelMixTile";
import { ContentInventoryTile } from "./components/ContentInventoryTile";
import { ConversionsTile } from "./components/ConversionsTile";
import { DiscordTile } from "./components/DiscordTile";
import { GithubTile } from "./components/GithubTile";
import { GrowthSection } from "./components/GrowthSection";
import { LandingSectionsTile } from "./components/LandingSectionsTile";
import { RangeSwitch } from "./components/RangeSwitch";
import { ResetLayoutButton } from "./components/ResetLayoutButton";
import { SearchConsoleTile } from "./components/SearchConsoleTile";
import { SearchEnginesTile } from "./components/SearchEnginesTile";
import { TopLandingPagesTile } from "./components/TopLandingPagesTile";
import { TopReferrersTile } from "./components/TopReferrersTile";
import { GrowthLayoutProvider } from "./providers/GrowthLayoutProvider";
import { GrowthRangeProvider } from "./providers/GrowthRangeProvider";

// Every growth signal in one place, ordered the way a visitor moves through
// it: how people arrive, what content they land on, whether they download and
// sign up, whether they stay and pay, and the distribution surfaces (GitHub,
// Discord, Google) that feed the top of that path. Tiles can be dragged and
// resized within their section; the arrangement is remembered per browser.

const CHART_H = 13;
const TABLE_H = 18;
const FUNNEL_H = 16;
const FULL_W = 12;

function GrowthPageContent() {
	const { t } = useLingui();

	const activatedRate = (
		<HogQLLineTile
			insight="activatedRate"
			description={t({
				message:
					"Real workspaces on 2+ distinct days within week 1 of first workspace (retention-validated definition)",
			})}
			xColumn={0}
			series={[
				{
					column: 3,
					key: "activation_pct",
					label: t({ message: "activation rate" }),
					kind: "line",
					suffix: "%",
				},
				{
					column: 1,
					key: "new_creators",
					label: t({ message: "new workspace creators" }),
					kind: "bar",
					rightAxis: true,
				},
			]}
		/>
	);

	return (
		<div className="space-y-10">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold">
						<Trans>Growth</Trans>
					</h1>
					<p className="text-muted-foreground">
						<Trans>
							Acquisition, content, conversion, retention, and distribution in
							one place. Weekly charts cover the selected range; the current
							week is partial. Drag a tile by its top edge, resize from the
							corner.
						</Trans>
					</p>
				</div>
				<div className="flex items-center gap-2">
					<RangeSwitch />
					<ResetLayoutButton />
				</div>
			</div>

			<GrowthSection
				section="acquisition"
				title={<Trans>Acquisition</Trans>}
				description={
					<Trans>
						How people reach superset.sh and the docs, and how much of it is
						search and assistants rather than the brand.
					</Trans>
				}
				tiles={[
					{ key: "channel-mix", node: <ChannelMixTile />, h: CHART_H },
					{ key: "ai-referrals", node: <AiReferralsTile />, h: CHART_H },
					{ key: "search-engines", node: <SearchEnginesTile />, h: CHART_H },
					{
						key: "new-site-visitors",
						node: (
							<TrendSeriesTile
								insight="newSiteVisitors"
								description={t({
									message: "First-ever pageview on superset.sh, daily",
								})}
							/>
						),
						h: CHART_H,
					},
					{ key: "top-referrers", node: <TopReferrersTile />, h: TABLE_H },
					{ key: "ai-agents", node: <AiAgentsTile />, h: TABLE_H },
				]}
			/>

			<GrowthSection
				section="content"
				title={<Trans>Content</Trans>}
				description={
					<Trans>
						What the content is doing: which pages sessions start on, and how
						much is being published.
					</Trans>
				}
				tiles={[
					{
						key: "landing-sections",
						node: <LandingSectionsTile />,
						h: CHART_H,
					},
					{
						key: "top-landing-pages",
						node: <TopLandingPagesTile />,
						h: TABLE_H,
					},
					{
						key: "content-inventory",
						node: <ContentInventoryTile />,
						w: FULL_W,
						h: CHART_H + 3,
					},
				]}
			/>

			<GrowthSection
				section="conversion"
				title={<Trans>Conversion</Trans>}
				description={
					<Trans>
						From a visit to a download to an account to a paying organization.
					</Trans>
				}
				tiles={[
					{
						key: "conversions",
						node: <ConversionsTile />,
						w: FULL_W,
						h: CHART_H + 3,
					},
					{
						key: "activation-funnel",
						node: <PostHogFunnelTile />,
						w: FULL_W,
						h: FUNNEL_H,
					},
					{
						key: "download-ctr",
						node: (
							<TrendSeriesTile
								insight="downloadCtrMac"
								description={t({
									message:
										"Weekly pageview → download conversion, Mac visitors; current week dashed",
								})}
								valueSuffix="%"
								dashIncompleteLast
							/>
						),
						h: CHART_H,
					},
					{ key: "activated-rate", node: activatedRate, h: CHART_H },
					{ key: "signup-to-paid", node: <SignupToPaidTile />, h: CHART_H },
				]}
			/>

			<GrowthSection
				section="retention"
				title={<Trans>Retention and revenue</Trans>}
				description={
					<Trans>Whether the people acquired stay and what they pay.</Trans>
				}
				tiles={[
					{ key: "mrr", node: <MrrTile />, h: CHART_H + 2 },
					{
						key: "logo-retention",
						node: <LogoRetentionTile />,
						h: CHART_H + 2,
					},
					{
						key: "churn-heatmap",
						node: <ChurnHeatmapTile />,
						w: FULL_W,
						h: TABLE_H,
					},
				]}
			/>

			<GrowthSection
				section="distribution"
				title={<Trans>Distribution and community</Trans>}
				description={
					<Trans>
						The surfaces outside the site that carry the product: the
						repository, releases, and Discord.
					</Trans>
				}
				tiles={[
					{ key: "github", node: <GithubTile />, w: 8, h: TABLE_H + 2 },
					{ key: "discord", node: <DiscordTile />, w: 4, h: 8 },
				]}
			/>

			<GrowthSection
				section="search"
				title={<Trans>Search</Trans>}
				description={
					<Trans>
						What Google shows us for and how much of it is not our own name.
					</Trans>
				}
				tiles={[
					{
						key: "search-console",
						node: <SearchConsoleTile />,
						w: FULL_W,
						h: TABLE_H + 8,
					},
				]}
			/>
		</div>
	);
}

export default function GrowthPage() {
	return (
		<GrowthRangeProvider>
			<GrowthLayoutProvider>
				<GrowthPageContent />
			</GrowthLayoutProvider>
		</GrowthRangeProvider>
	);
}
