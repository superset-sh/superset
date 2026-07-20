import type { CostStatsData } from "../../types";
import { formatCompactTokens, formatUsd } from "../../utils/format";

interface CostStatsProps {
	cost: CostStatsData;
}

function StatCell({ label, value }: { label: string; value: string }) {
	return (
		<div className="space-y-0.5">
			<div className="text-[10px] uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div className="font-mono text-sm font-bold tabular-nums text-foreground">
				{value}
			</div>
		</div>
	);
}

export function CostStats({ cost }: CostStatsProps) {
	const prefix = cost.approximate ? "~" : "";

	return (
		<div className="grid grid-cols-2 gap-x-4 gap-y-3">
			<StatCell label="Today" value={`${prefix}$${formatUsd(cost.todayUsd)}`} />
			<StatCell
				label="30d cost"
				value={`${prefix}$${formatUsd(cost.thirtyDayUsd)}`}
			/>
			<StatCell
				label="30d tokens"
				value={`${prefix}${formatCompactTokens(cost.thirtyDayTokens)}`}
			/>
			<StatCell
				label="Latest tokens"
				value={`${prefix}${formatCompactTokens(cost.latestSessionTokens)}`}
			/>
		</div>
	);
}
