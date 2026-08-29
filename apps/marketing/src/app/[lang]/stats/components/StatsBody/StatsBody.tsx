import { useLingui } from "@lingui/react/macro";
import {
	buildModelColors,
	ModelBars,
	toSpendRows,
	toTokenRows,
	toUserRows,
} from "@/app/[lang]/components/ModelBars";
import { StatStrip } from "@/app/[lang]/components/StatStrip";
import { TokenSplitBar } from "@/app/[lang]/components/TokenSplitBar";
import type { LeaderboardStats } from "@/app/[lang]/utils/fetchLeaderboard";
import {
	formatCount,
	formatTokens,
	formatUsd,
} from "@/app/[lang]/utils/formatUsage";
import { Panel } from "./components/Panel";

export function StatsBody({
	stats,
	pixelClassName,
}: {
	stats: LeaderboardStats;
	pixelClassName: string;
}) {
	const { t } = useLingui();
	const { totals, tokenSplit, models } = stats;
	const colors = buildModelColors([
		models.byUsers,
		models.bySpend,
		models.byTokens,
	]);
	const cacheShare =
		totals.tokens > 0
			? Math.round((tokenSplit.cachedInput / totals.tokens) * 100)
			: 0;

	return (
		<div className="space-y-6">
			<StatStrip
				pixelClassName={pixelClassName}
				stats={[
					{
						label: t({
							id: "marketing.stats.totalSpend",
							message: "Total spend",
						}),
						value: formatUsd(totals.usd),
						hint: t({
							id: "marketing.stats.totalSpendHint",
							message: "API-equivalent",
						}),
					},
					{
						label: t({ id: "marketing.stats.tokens", message: "Tokens" }),
						value: formatTokens(totals.tokens),
					},
					{
						label: t({
							id: "marketing.stats.developers",
							message: "Developers",
						}),
						value: formatCount(totals.participants),
						hint: t({
							id: "marketing.stats.developersHint",
							message: "on the board",
						}),
					},
					{
						label: t({
							id: "marketing.stats.cacheRead",
							message: "Cache read",
						}),
						value: `${cacheShare}%`,
						hint: t({
							id: "marketing.stats.cacheReadHint",
							message: "of all tokens",
						}),
					},
				]}
			/>

			<Panel
				title={t({
					id: "marketing.stats.tokenBreakdown",
					message: "Token breakdown",
				})}
			>
				<TokenSplitBar split={tokenSplit} />
			</Panel>

			<div className="grid gap-6 md:grid-cols-2">
				<Panel
					title={t({
						id: "marketing.stats.popularModels",
						message: "Popular models",
					})}
					meta={t({
						id: "marketing.stats.popularModelsMeta",
						message: "by users",
					})}
				>
					<ModelBars rows={toUserRows(models.byUsers)} colors={colors} />
				</Panel>
				<Panel
					title={t({ id: "marketing.stats.topModels", message: "Top models" })}
					meta={t({ id: "marketing.stats.topModelsMeta", message: "by spend" })}
				>
					<ModelBars rows={toSpendRows(models.bySpend)} colors={colors} />
				</Panel>
				<Panel
					title={t({
						id: "marketing.stats.modelVolume",
						message: "Model volume",
					})}
					meta={t({
						id: "marketing.stats.modelVolumeMeta",
						message: "by tokens",
					})}
					className="md:col-span-2"
				>
					<ModelBars rows={toTokenRows(models.byTokens)} colors={colors} />
				</Panel>
			</div>
		</div>
	);
}
