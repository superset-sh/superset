import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";

interface MetricBadgeProps {
	label: string;
	value: string;
	tooltip?: string;
}

export function MetricBadge({ label, value, tooltip }: MetricBadgeProps) {
	const content = (
		<div className="min-w-0 px-1 py-0.5">
			<span className="block text-[10px] text-muted-foreground uppercase tracking-wide whitespace-nowrap">
				{label}
			</span>
			<span className="block text-base leading-5 font-medium tabular-nums whitespace-nowrap text-muted-foreground">
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
