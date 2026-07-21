import type { CostStatsData } from "../../types";
import { formatCompactTokens, formatUsd } from "../../utils/format";

interface CostStatsProps {
	cost: CostStatsData;
}

function StatCell({ label, value }: { label: string; value: string }) {
	return (
		<div className="space-y-1">
			<div className="text-[10px] uppercase tracking-widest text-muted-foreground">
				{label}
			</div>
			<div className="text-[15px] font-bold tabular-nums text-foreground">
				{value}
			</div>
		</div>
	);
}

export function CostStats({ cost }: CostStatsProps) {
	const prefix = cost.approximate ? "~" : "";

	return (
		<div className="grid grid-cols-2 gap-x-4 gap-y-4">
			<StatCell label="Today" value={`${prefix}$${formatUsd(cost.todayUsd)}`} />
			<StatCell
				label="30D cost"
				value={`${prefix}$${formatUsd(cost.thirtyDayUsd)}`}
			/>
			<StatCell
				label="30D tokens"
				value={`${prefix}${formatCompactTokens(cost.thirtyDayTokens)}`}
			/>
			<StatCell
				label="Latest tokens"
				value={`${prefix}${formatCompactTokens(cost.latestSessionTokens)}`}
			/>
		</div>
	);
}
