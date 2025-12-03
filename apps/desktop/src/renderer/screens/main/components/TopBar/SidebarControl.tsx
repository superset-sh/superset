import { Button } from "@superset/ui/button";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { HiMiniBars3, HiMiniBars3BottomLeft } from "react-icons/hi2";
import { useSidebarStore } from "renderer/stores";
import { formatKeysForDisplay, HOTKEYS } from "shared/hotkeys";

export function SidebarControl() {
	const { isSidebarOpen, toggleSidebar } = useSidebarStore();
	const keys = formatKeysForDisplay(HOTKEYS.TOGGLE_SIDEBAR.keys);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={toggleSidebar}
					aria-label="Toggle sidebar"
					className="no-drag"
				>
					{isSidebarOpen ? (
						<HiMiniBars3BottomLeft className="size-4" />
					) : (
						<HiMiniBars3 className="size-4" />
					)}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom" showArrow={false}>
				<span className="flex items-center gap-2">
					Toggle sidebar
					<KbdGroup>
						{keys.map((key) => (
							<Kbd key={key}>{key}</Kbd>
						))}
					</KbdGroup>
				</span>
			</TooltipContent>
		</Tooltip>
	);
}
