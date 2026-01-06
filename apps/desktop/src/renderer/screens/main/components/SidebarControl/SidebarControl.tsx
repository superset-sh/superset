import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { VscSourceControl } from "react-icons/vsc";
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
					aria-pressed={isSidebarOpen}
					className={cn(
						"no-drag gap-1.5",
						isSidebarOpen
							? "font-semibold text-foreground"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					<VscSourceControl className="size-4" />
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
