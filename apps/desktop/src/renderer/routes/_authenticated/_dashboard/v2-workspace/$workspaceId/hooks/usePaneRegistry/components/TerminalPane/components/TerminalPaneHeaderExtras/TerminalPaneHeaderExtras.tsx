import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { SquarePen } from "lucide-react";
import { useHotkeyDisplay } from "renderer/hotkeys";
import {
	terminalRichInputOpenStore,
	useTerminalRichInputOpen,
} from "../../richInputOpenStore";
import { TerminalConnectionIndicator } from "./components/TerminalConnectionIndicator";
import { TerminalIdCopyMenu } from "./components/TerminalIdCopyMenu";

interface TerminalPaneHeaderExtrasProps {
	workspaceId: string;
	terminalId: string;
	terminalInstanceId: string;
}

/**
 * Header affordance that opens the rich-input overlay, so the ⌘I composer is
 * discoverable without knowing the shortcut. Toggles the same shared open-state
 * the hotkey drives; the tooltip carries the shortcut as the teach path.
 * Also hosts the connection indicator and identifier copy menu.
 */
export function TerminalPaneHeaderExtras({
	workspaceId,
	terminalId,
	terminalInstanceId,
}: TerminalPaneHeaderExtrasProps) {
	const isOpen = useTerminalRichInputOpen();
	const hotkeyText = useHotkeyDisplay("TOGGLE_TERMINAL_RICH_INPUT").text;
	const label =
		hotkeyText === "Unassigned" ? "Rich input" : `Rich input (${hotkeyText})`;

	return (
		<div className="flex items-center">
			<TerminalConnectionIndicator
				terminalId={terminalId}
				terminalInstanceId={terminalInstanceId}
			/>
			<TerminalIdCopyMenu workspaceId={workspaceId} terminalId={terminalId} />
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => terminalRichInputOpenStore.toggle("header_button")}
						aria-label={label}
						aria-pressed={isOpen}
						className={cn(
							"rounded p-0.5 transition-colors",
							isOpen
								? "bg-secondary text-foreground"
								: "text-muted-foreground/60 hover:text-muted-foreground",
						)}
					>
						<SquarePen className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">{label}</TooltipContent>
			</Tooltip>
		</div>
	);
}
