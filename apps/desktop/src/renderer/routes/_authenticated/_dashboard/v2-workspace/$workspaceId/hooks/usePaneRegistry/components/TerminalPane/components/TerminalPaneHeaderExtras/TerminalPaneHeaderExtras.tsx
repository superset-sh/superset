import { useLingui } from "@lingui/react/macro";
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
import { TerminalPageWatchChip } from "./components/TerminalPageWatchChip";
import { TerminalSessionHandoffMenu } from "./components/TerminalSessionHandoffMenu";

interface TerminalPaneHeaderExtrasProps {
	workspaceId: string;
	terminalId: string;
	terminalInstanceId: string;
	onCreateNewAgentSession: (input: {
		configId: string;
		placement: "split-pane" | "new-tab";
		prompt: string;
		forkSessionId?: string;
	}) => Promise<{ terminalId: string } | null>;
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
	onCreateNewAgentSession,
}: TerminalPaneHeaderExtrasProps) {
	const { t } = useLingui();
	const isOpen = useTerminalRichInputOpen();
	const hotkeyText = useHotkeyDisplay("TOGGLE_TERMINAL_RICH_INPUT").text;
	const label =
		hotkeyText === "Unassigned"
			? t({
					message: "Rich input",
				})
			: t({
					message: `Rich input (${hotkeyText})`,
				});

	return (
		<div className="flex items-center">
			<TerminalConnectionIndicator
				terminalId={terminalId}
				terminalInstanceId={terminalInstanceId}
			/>
			<TerminalPageWatchChip
				workspaceId={workspaceId}
				terminalId={terminalId}
			/>
			<TerminalIdCopyMenu workspaceId={workspaceId} terminalId={terminalId} />
			<TerminalSessionHandoffMenu
				workspaceId={workspaceId}
				terminalId={terminalId}
				onCreateNewAgentSession={onCreateNewAgentSession}
			/>
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
