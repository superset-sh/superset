import { useLingui } from "@lingui/react/macro";
import type { UsageHistory } from "../../../../hooks/useHostUsageHistory";
import { formatTokens, formatUsd } from "../../utils/formatUsage";

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex min-w-0 flex-col">
			<span className="truncate text-[10px] text-muted-foreground">
				{label}
			</span>
			<span className="text-sm font-medium tabular-nums">{value}</span>
		</div>
	);
}

/** One-line stat strip — five numbers, no chrome. */
export function UsageMetricTiles({ history }: { history: UsageHistory }) {
	const { t } = useLingui();
	const { totals } = history;
	const observedInput =
		totals.uncachedInput + totals.cachedInput + totals.cacheWrite;
	const cachedShare =
		observedInput > 0
			? Math.round((100 * totals.cachedInput) / observedInput)
			: 0;
	const savingsMultiple =
		totals.usd > 0 ? (totals.cacheSavingsUsd / totals.usd).toFixed(1) : "0";

	return (
		<div className="grid grid-cols-3 gap-x-4 gap-y-1 border-y py-2 md:grid-cols-5">
			<Stat
				label={t({
					id: "settings.usage.metricTiles.processedTokens",
					message: "Processed tokens",
				})}
				value={formatTokens(totals.tokens)}
			/>
			<Stat
				label={t({
					id: "settings.usage.metricTiles.cachedInput",
					message: "Cached input",
				})}
				value={`${formatTokens(totals.cachedInput)} · ${cachedShare}%`}
			/>
			<Stat
				label={t({
					id: "settings.usage.metricTiles.uncachedInput",
					message: "Uncached input",
				})}
				value={formatTokens(totals.uncachedInput)}
			/>
			<Stat
				label={t({
					id: "settings.usage.metricTiles.output",
					message: "Output",
				})}
				value={formatTokens(totals.output)}
			/>
			<Stat
				label={t({
					id: "settings.usage.metricTiles.cacheSavings",
					message: "Cache savings",
				})}
				value={`${formatUsd(totals.cacheSavingsUsd)} · ${savingsMultiple}x`}
			/>
		</div>
	);
}
