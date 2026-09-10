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
		// The pane header is a native drag source, so a press that moves a few
		// pixels starts a pane drag and the click never fires: making this
		// wrapper the nearest draggable and canceling its dragstart keeps such a
		// press a click. Preventing mousedown keeps the press from stealing
		// focus (blurring the terminal) and from triggering the pane-focus
		// re-render before the click lands; stopping click keeps actions from
		// also firing the header's click-to-pin.
		// biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: propagation shield around the action buttons, not an interactive control
		<div
			className="flex shrink-0 items-center gap-0.5"
			draggable
			onDragStart={(e) => {
				e.preventDefault();
				e.stopPropagation();
			}}
			onMouseDown={(e) => {
				e.preventDefault();
				e.stopPropagation();
			}}
			onClick={(e) => e.stopPropagation()}
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
						<TooltipContent side="bottom">{tooltip}</TooltipContent>
					</Tooltip>
				);
			})}
		</div>
	);
}
