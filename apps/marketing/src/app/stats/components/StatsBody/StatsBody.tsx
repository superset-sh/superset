import {
	buildModelColors,
	ModelBars,
	toSpendRows,
	toTokenRows,
	toUserRows,
} from "@/app/components/ModelBars";
import { StatStrip } from "@/app/components/StatStrip";
import { TokenSplitBar } from "@/app/components/TokenSplitBar";
import type { LeaderboardStats } from "@/app/utils/fetchLeaderboard";
import { formatCount, formatTokens, formatUsd } from "@/app/utils/formatUsage";
import { Panel } from "./components/Panel";

export function StatsBody({
	stats,
	pixelClassName,
}: {
	stats: LeaderboardStats;
	pixelClassName: string;
}) {
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
						label: "Total spend",
						value: formatUsd(totals.usd),
						hint: "API-equivalent",
					},
					{ label: "Tokens", value: formatTokens(totals.tokens) },
					{
						label: "Developers",
						value: formatCount(totals.participants),
						hint: "on the board",
					},
					{
						label: "Cache read",
						value: `${cacheShare}%`,
						hint: "of all tokens",
					},
				]}
			/>

			<Panel title="Token breakdown">
				<TokenSplitBar split={tokenSplit} />
			</Panel>

			<div className="grid gap-6 md:grid-cols-2">
				<Panel title="Popular models" meta="by users">
					<ModelBars rows={toUserRows(models.byUsers)} colors={colors} />
				</Panel>
				<Panel title="Top models" meta="by spend">
					<ModelBars rows={toSpendRows(models.bySpend)} colors={colors} />
				</Panel>
				<Panel title="Model volume" meta="by tokens" className="md:col-span-2">
					<ModelBars rows={toTokenRows(models.byTokens)} colors={colors} />
				</Panel>
			</div>
		</div>
	);
}
