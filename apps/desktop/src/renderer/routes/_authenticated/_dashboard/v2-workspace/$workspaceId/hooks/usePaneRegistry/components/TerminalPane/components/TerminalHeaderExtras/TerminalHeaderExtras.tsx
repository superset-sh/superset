import type { RendererContext } from "@superset/panes";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { Archive } from "lucide-react";
import { markTerminalForBackground } from "renderer/lib/terminal/terminal-background-intents";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";

interface TerminalHeaderExtrasProps {
	context: RendererContext<PaneViewerData>;
}

export function TerminalHeaderExtras({ context }: TerminalHeaderExtrasProps) {
	if (context.pane.kind !== "terminal") return null;

	const data = context.pane.data as TerminalPaneData;

	const handleMoveToBackground = () => {
		markTerminalForBackground(data.terminalId);
		void context.actions.close();
	};

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label="Move terminal to background"
					onClick={(event) => {
						event.stopPropagation();
						handleMoveToBackground();
					}}
					className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
				>
					<Archive className="size-3.5" />
				</button>
			</TooltipTrigger>
			<TooltipContent side="bottom" showArrow={false}>
				Move terminal to background
			</TooltipContent>
		</Tooltip>
	);
}
