import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";

interface MetricBadgeProps {
	label: string;
	value: string;
	tooltip?: string;
}

export function MetricBadge({ label, value, tooltip }: MetricBadgeProps) {
	const content = (
		<div className="min-w-0 px-3 first:pl-0 last:pr-0">
			<div className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground/80">
				{label}
			</div>
			<div className="mt-1.5 text-[15px] leading-none font-medium tabular-nums tracking-tight text-foreground whitespace-nowrap">
				{value}
			</div>
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
