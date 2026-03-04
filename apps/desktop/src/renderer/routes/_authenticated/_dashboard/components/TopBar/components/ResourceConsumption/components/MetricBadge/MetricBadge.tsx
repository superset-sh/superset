import { cn } from "@superset/ui/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { UsageSeverity } from "../../types";
import { getUsageClasses } from "../../utils/resourceSeverity";

interface MetricBadgeProps {
	label: string;
	value: string;
	severity?: UsageSeverity;
	tooltip?: string;
}

export function MetricBadge({
	label,
	value,
	severity = "normal",
	tooltip,
}: MetricBadgeProps) {
	const classes = getUsageClasses(severity);
	const content = (
		<div className="min-w-0 px-1 py-0.5">
			<span className="block text-[10px] text-muted-foreground uppercase tracking-wide whitespace-nowrap">
				{label}
			</span>
			<span
				className={cn(
					"block text-base leading-5 font-medium tabular-nums whitespace-nowrap",
					classes.metricClass,
				)}
			>
				{value}
			</span>
		</div>
	);

	if (!tooltip) return content;

	return (
		<Tooltip delayDuration={150}>
			<TooltipTrigger asChild>{content}</TooltipTrigger>
			<TooltipContent side="top" sideOffset={6} showArrow={false}>
				{tooltip}
			</TooltipContent>
		</Tooltip>
	);
}
