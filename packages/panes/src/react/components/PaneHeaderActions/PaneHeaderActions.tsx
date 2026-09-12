import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Fragment } from "react";
import type { PaneActionConfig, RendererContext } from "../../types";

export function PaneHeaderActions<TData>({
	actions,
	context,
}: {
	actions: PaneActionConfig<TData>[];
	context: RendererContext<TData>;
}) {
	return (
		<div className="flex shrink-0 items-center gap-1">
			{actions.map((action, _index) => {
				const icon =
					typeof action.icon === "function"
						? action.icon(context)
						: action.icon;
				const tooltip =
					typeof action.tooltip === "function"
						? action.tooltip(context)
						: action.tooltip;

				const button = (
					<button
						type="button"
						onClick={() => action.onClick(context)}
						className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
					>
						{icon}
					</button>
				);

				if (tooltip == null) {
					return <Fragment key={action.key}>{button}</Fragment>;
				}

				return (
					<Tooltip key={action.key} delayDuration={1000}>
						<TooltipTrigger asChild>{button}</TooltipTrigger>
						<TooltipContent side="bottom">{tooltip}</TooltipContent>
					</Tooltip>
				);
			})}
		</div>
	);
}
