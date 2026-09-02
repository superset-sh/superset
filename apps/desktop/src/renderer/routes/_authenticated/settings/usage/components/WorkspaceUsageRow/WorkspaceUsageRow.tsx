import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import type { UsageHistory } from "../../hooks/useHostUsageHistory";
import type { HistoryMetric } from "../UsageHistorySection/constants";
import {
	formatTokens,
	formatUsd,
} from "../UsageHistorySection/utils/formatUsage";

export type ProjectRow = UsageHistory["projects"][number];

/**
 * One workspace/repo attribution row: name, kind badge, tokens + cost, and a
 * thin share bar. Links into the drilldown when a detail cube exists for it.
 */
export function WorkspaceUsageRow({
	row,
	maxValue,
	metric,
	drillable,
}: {
	row: ProjectRow;
	maxValue: number;
	metric: HistoryMetric;
	drillable: boolean;
}) {
	const value = metric === "usd" ? row.usd : row.tokens;
	const content = (
		<>
			<div className="flex items-baseline justify-between gap-3 text-[11px]">
				<span className="flex min-w-0 items-baseline gap-1.5 truncate">
					{row.project}
					{row.kind === "project" && (
						<span className="text-[9px] uppercase text-muted-foreground">
							<Trans id="settings.usage.workspaceRow.repoBadge">repo</Trans>
						</span>
					)}
				</span>
				<span className="flex shrink-0 items-baseline gap-2 tabular-nums">
					<span className="text-muted-foreground">
						{formatTokens(row.tokens)}
					</span>
					<span>{formatUsd(row.usd)}</span>
				</span>
			</div>
			<div className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
				<div
					className="h-full rounded-full bg-primary/60"
					style={{
						width: `${maxValue > 0 ? Math.max(1, (100 * value) / maxValue) : 0}%`,
					}}
				/>
			</div>
		</>
	);
	return drillable ? (
		<Link
			to="/settings/usage/workspace/$workspaceName"
			params={{ workspaceName: row.project }}
			className="flex flex-col gap-0.5 rounded px-1 py-0.5 transition-colors hover:bg-muted/60"
		>
			{content}
		</Link>
	) : (
		<div className="flex flex-col gap-0.5 px-1 py-0.5">{content}</div>
	);
}
