import { Button } from "@superset/ui/button";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuPanelLeft, LuPanelLeftClose } from "react-icons/lu";
import { useWorkspaceSidebarStore } from "renderer/stores";
import { HOTKEYS } from "shared/hotkeys";

export function WorkspaceSidebarControl() {
	const { isOpen, toggleOpen } = useWorkspaceSidebarStore();

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={toggleOpen}
					aria-label="Toggle workspace sidebar"
					className="no-drag"
				>
					{isOpen ? (
						<LuPanelLeftClose className="size-4" />
					) : (
						<LuPanelLeft className="size-4" />
					)}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom" showArrow={false}>
				<span className="flex items-center gap-2">
					Toggle Workspaces
					<KbdGroup>
						{HOTKEYS.TOGGLE_WORKSPACE_SIDEBAR.display.map((key) => (
							<Kbd key={key}>{key}</Kbd>
						))}
					</KbdGroup>
				</span>
			</TooltipContent>
		</Tooltip>
	);
}
