import type { RendererContext } from "@superset/panes";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { SquarePen } from "lucide-react";
import { useHotkeyDisplay } from "renderer/hotkeys";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import {
	terminalRichInputOpenStore,
	useTerminalRichInputOpen,
} from "../../richInputOpenStore";

interface TerminalPaneHeaderExtrasProps {
	context: RendererContext<PaneViewerData>;
}

/**
 * Header affordance that opens the rich-input overlay, so the ⌘I composer is
 * discoverable without knowing the shortcut. Toggles the same shared open-state
 * the hotkey drives; the tooltip carries the shortcut as the teach path.
 */
export function TerminalPaneHeaderExtras({
	context,
}: TerminalPaneHeaderExtrasProps) {
	const { terminalId } = context.pane.data as TerminalPaneData;
	const isOpen = useTerminalRichInputOpen(terminalId);
	const hotkeyText = useHotkeyDisplay("TOGGLE_TERMINAL_RICH_INPUT").text;
	const label =
		hotkeyText === "Unassigned" ? "Rich input" : `Rich input (${hotkeyText})`;

	return (
		<div className="flex items-center">
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => terminalRichInputOpenStore.toggle(terminalId)}
						aria-label={label}
						aria-pressed={isOpen}
						className={cn(
							"flex size-5 items-center justify-center transition-colors",
							isOpen
								? "bg-secondary text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<SquarePen className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					{label}
				</TooltipContent>
			</Tooltip>
			<div
				className="mx-1 h-3.5 w-px bg-muted-foreground/30"
				aria-hidden="true"
			/>
		</div>
	);
}
