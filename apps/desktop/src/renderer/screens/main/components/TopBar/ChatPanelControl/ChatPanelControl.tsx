import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuPanelRight, LuPanelRightClose } from "react-icons/lu";
import { useChatPanelStore } from "renderer/stores/chat-panel-state";

export function ChatPanelControl() {
	const { isOpen, togglePanel } = useChatPanelStore();

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={togglePanel}
					aria-label={isOpen ? "Hide chat" : "Show chat"}
					className="no-drag"
				>
					{isOpen ? (
						<LuPanelRightClose className="size-4" />
					) : (
						<LuPanelRight className="size-4" />
					)}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom" showArrow={false}>
				Toggle chat panel
			</TooltipContent>
		</Tooltip>
	);
}
