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
		// biome-ignore lint/a11y/noStaticElementInteractions: stop mousedown from triggering pane focus re-render before click fires
		<div
			className="flex shrink-0 items-center gap-0.5"
			onMouseDown={(e) => e.stopPropagation()}
		>
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
						className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
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
						<TooltipContent
							side="bottom"
							sideOffset={4}
							showArrow={false}
							className="rounded-sm border border-border bg-background px-1.5 py-0.5 font-medium text-muted-foreground shadow-sm"
						>
							{tooltip}
						</TooltipContent>
					</Tooltip>
				);
			})}
		</div>
	);
}
