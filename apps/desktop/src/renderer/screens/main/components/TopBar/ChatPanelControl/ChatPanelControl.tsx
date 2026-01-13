import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuMessageSquare } from "react-icons/lu";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent";
import { useChatPanelStore } from "renderer/stores";

export function ChatPanelControl() {
	const { isOpen, togglePanel } = useChatPanelStore();

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					onClick={togglePanel}
					aria-label={isOpen ? "Hide Chat Panel" : "Show Chat Panel"}
					aria-pressed={isOpen}
					className={cn(
						"no-drag gap-1.5",
						isOpen
							? "font-semibold text-foreground bg-accent"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					<LuMessageSquare className="size-4" />
					<span className="text-xs">Chat</span>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom" showArrow={false}>
				<HotkeyTooltipContent
					label="Toggle Chat Panel"
					hotkeyId="TOGGLE_CHAT_PANEL"
				/>
			</TooltipContent>
		</Tooltip>
	);
}
