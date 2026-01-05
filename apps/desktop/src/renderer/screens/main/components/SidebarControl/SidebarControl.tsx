import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { HiMiniBars3, HiMiniBars3BottomLeft } from "react-icons/hi2";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent";
import { useSidebarStore } from "renderer/stores";

export function SidebarControl() {
	const { isSidebarOpen, toggleSidebar } = useSidebarStore();

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					onClick={toggleSidebar}
					aria-label={
						isSidebarOpen ? "Hide Changes Sidebar" : "Show Changes Sidebar"
					}
					className="no-drag gap-1.5 text-muted-foreground hover:text-foreground"
				>
					{isSidebarOpen ? (
						<HiMiniBars3BottomLeft className="size-4" />
					) : (
						<HiMiniBars3 className="size-4" />
					)}
					<span className="text-xs">Changes</span>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom" showArrow={false}>
				<HotkeyTooltipContent
					label="Toggle Changes Sidebar"
					hotkeyId="TOGGLE_SIDEBAR"
				/>
			</TooltipContent>
		</Tooltip>
	);
}
