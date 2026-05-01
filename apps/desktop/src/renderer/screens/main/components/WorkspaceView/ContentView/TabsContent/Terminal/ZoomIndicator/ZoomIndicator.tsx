import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Maximize2 } from "lucide-react";
import { useHotkeyDisplay } from "renderer/hotkeys";

export function ZoomIndicator() {
	const display = useHotkeyDisplay("ZOOM_PANE");
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div
					role="img"
					aria-label="Pane zoomed"
					className="flex items-center justify-center px-1 text-muted-foreground"
				>
					<Maximize2 className="h-3 w-3" />
				</div>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				Zoomed — {display.text} to restore
			</TooltipContent>
		</Tooltip>
	);
}
