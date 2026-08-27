import { useNavigate } from "@tanstack/react-router";
import type { UsageHistory } from "../../../../hooks/useHostUsageHistory";
import { PROVIDER_CHART_CONFIG } from "../../constants";
import { formatTokens, formatUsd } from "../../utils/formatUsage";

const MAX_ROWS = 6;

export function UsageModelTable({ history }: { history: UsageHistory }) {
	const navigate = useNavigate();
	const rows = history.models.slice(0, MAX_ROWS);
	const totalUsd = history.totals.usd;
	if (rows.length === 0) return null;

	return (
		<table className="w-full text-[11px]">
			<thead>
				<tr className="border-b text-left text-muted-foreground">
					<th className="py-1 pr-2 font-medium">Model</th>
					<th className="py-1 pr-2 text-right font-medium">Cost</th>
					<th className="py-1 pr-2 text-right font-medium">Share</th>
					<th className="py-1 text-right font-medium">Tokens</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((row) => (
					<tr
						key={`${row.provider}|${row.model}`}
						className="cursor-pointer transition-colors hover:bg-muted/60"
						onClick={() =>
							navigate({
								to: "/settings/usage/model/$modelKey",
								params: { modelKey: `${row.provider}|${row.model}` },
							})
						}
					>
						<td className="flex items-center gap-1.5 py-1 pr-2">
							<span
								className="size-1.5 shrink-0 rounded-[2px]"
								style={{
									background: PROVIDER_CHART_CONFIG[row.provider].color,
								}}
							/>
							<span className="truncate">{row.model}</span>
						</td>
						<td className="py-1 pr-2 text-right tabular-nums">
							{row.approximate ? "~" : ""}
							{formatUsd(row.usd)}
						</td>
						<td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">
							{totalUsd > 0
								? `${Math.round((100 * row.usd) / totalUsd)}%`
								: "—"}
						</td>
						<td className="py-1 text-right tabular-nums text-muted-foreground">
							{formatTokens(row.tokens)}
						</td>
					</tr>
				))}
			</tbody>
			<tfoot>
				<tr className="border-t font-medium">
					<td className="py-1 pr-2">Total</td>
					<td className="py-1 pr-2 text-right tabular-nums">
						{history.totals.approximate ? "~" : ""}
						{formatUsd(totalUsd)}
					</td>
					<td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">
						100%
					</td>
					<td className="py-1 text-right tabular-nums text-muted-foreground">
						{formatTokens(history.totals.tokens)}
					</td>
				</tr>
			</tfoot>
		</table>
	);
}
