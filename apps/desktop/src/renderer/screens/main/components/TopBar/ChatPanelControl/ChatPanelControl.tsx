import { Button } from "@superset/ui/button";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuPanelRight, LuPanelRightClose } from "react-icons/lu";
import { useChatPanelStore } from "renderer/stores";
import { HOTKEYS } from "shared/hotkeys";

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
				<span className="flex items-center gap-2">
					Toggle chat
					<KbdGroup>
						{HOTKEYS.TOGGLE_CHAT_PANEL.display.map((key) => (
							<Kbd key={key}>{key}</Kbd>
						))}
					</KbdGroup>
				</span>
			</TooltipContent>
		</Tooltip>
	);
}
