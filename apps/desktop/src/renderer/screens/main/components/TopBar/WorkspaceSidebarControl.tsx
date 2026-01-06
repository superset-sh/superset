import { Button } from "@superset/ui/button";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuPanelLeft, LuPanelLeftClose } from "react-icons/lu";
import { useWorkspaceSidebarStore } from "renderer/stores";
import {
	formatHotkeyDisplay,
	getCurrentPlatform,
	getHotkey,
} from "shared/hotkeys";

export function WorkspaceSidebarControl() {
	const { isOpen, isCollapsed, toggleCollapsed, setOpen } =
		useWorkspaceSidebarStore();

	const handleToggle = () => {
		if (!isOpen) {
			// If sidebar is closed, open it to collapsed state
			setOpen(true);
		} else {
			// If sidebar is open, toggle between collapsed and expanded
			toggleCollapsed();
		}
	};

	const sidebarCollapsed = isCollapsed();
	const hotkeyDisplay = formatHotkeyDisplay(
		getHotkey("TOGGLE_WORKSPACE_SIDEBAR"),
		getCurrentPlatform(),
	);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={handleToggle}
					aria-label="Toggle workspace sidebar"
					className="no-drag"
				>
					{isOpen && !sidebarCollapsed ? (
						<LuPanelLeftClose className="size-4" />
					) : (
						<LuPanelLeft className="size-4" />
					)}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom" showArrow={false}>
				<span className="flex items-center gap-2">
					{sidebarCollapsed ? "Expand" : "Collapse"} Workspaces
					<KbdGroup>
						{hotkeyDisplay.map((key) => (
							<Kbd key={key}>{key}</Kbd>
						))}
					</KbdGroup>
				</span>
			</TooltipContent>
		</Tooltip>
	);
}
