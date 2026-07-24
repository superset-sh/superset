import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuTrendingDown, LuTrendingUp } from "react-icons/lu";

export interface TrendCellProps {
	trendPct: number | null;
	/** Core events in the current 30-day window (for the tooltip). */
	events30d?: number;
	/** Core events in the prior 30-day window (for the tooltip). */
	events30dPrev?: number;
}

const numberFormat = new Intl.NumberFormat("en-US");

/** Core product events, last 30 days vs the 30 days before. */
export function TrendCell({
	trendPct,
	events30d,
	events30dPrev,
}: TrendCellProps) {
	const windowDetail =
		events30d != null && events30dPrev != null
			? `: ${numberFormat.format(events30d)} events in the last 30 days vs ${numberFormat.format(events30dPrev)} in the 30 days before`
			: " — last 30 days vs the 30 days before";

	if (trendPct == null) {
		return (
			<Tooltip>
				<TooltipTrigger className="text-muted-foreground cursor-default text-sm">
					—
				</TooltipTrigger>
				<TooltipContent>
					No baseline — no activity in the prior 30-day window
				</TooltipContent>
			</Tooltip>
		);
	}

	const positive = trendPct >= 0;
	return (
		<Tooltip>
			<TooltipTrigger
				className={
					positive
						? "flex cursor-default items-center gap-1 text-emerald-500"
						: "flex cursor-default items-center gap-1 text-red-400"
				}
			>
				{positive ? (
					<LuTrendingUp className="size-3.5" />
				) : (
					<LuTrendingDown className="size-3.5" />
				)}
				{positive ? "+" : ""}
				{trendPct}%
			</TooltipTrigger>
			<TooltipContent>30-day event volume{windowDetail}</TooltipContent>
		</Tooltip>
	);
}
