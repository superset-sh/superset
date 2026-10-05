import { useLingui } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { StatStrip } from "@/app/[lang]/components/StatStrip";
import type { LeaderboardStats } from "@/app/[lang]/utils/fetchLeaderboard";
import { formatTokens, formatUsd } from "@/app/[lang]/utils/formatUsage";

export function LeaderboardSummary({
	stats,
	loading,
}: {
	stats: LeaderboardStats;
	loading: boolean;
}) {
	const { t, i18n } = useLingui();
	const totals = stats.totals;
	const items = [
		{
			label: t({ message: "Developers" }),
			value: formatNumber(totals.participants, undefined, i18n.locale),
		},
		{
			label: t({ message: "Tokens" }),
			value: formatTokens(totals.tokens, i18n.locale),
		},
		{
			label: t({ message: "Cost" }),
			value: formatUsd(totals.usd, i18n.locale),
			hint: t({ message: "API-equivalent" }),
		},
		{
			label: t({ message: "Cache read" }),
			value: formatNumber(
				Number(totals.tokens) > 0
					? Number(stats.tokenSplit.cachedInput) / Number(totals.tokens)
					: 0,
				{ style: "percent", maximumFractionDigits: 0 },
				i18n.locale,
			),
			hint: t({ message: "of all tokens" }),
		},
	];
	return <StatStrip stats={items} loading={loading} />;
}
