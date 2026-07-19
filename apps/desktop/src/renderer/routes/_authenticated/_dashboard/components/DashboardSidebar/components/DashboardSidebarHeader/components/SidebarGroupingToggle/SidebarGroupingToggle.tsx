import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuLayoutList } from "react-icons/lu";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { useStatusGroupedSidebarEnabled } from "renderer/stores/status-grouped-sidebar";

/**
 * Inline control in the sidebar header (beside the resources badge) that opens
 * a menu to group the rail by status or by project. Renders nothing unless the
 * status-grouped-sidebar feature flag is enabled. Mirrors the neighboring
 * ResourceConsumption trigger (ghost icon-xs) and carries `no-drag` so clicks
 * land instead of being swallowed by the window drag region.
 */
export function SidebarGroupingToggle() {
	const enabled = useStatusGroupedSidebarEnabled();
	const { preferences, setSidebarGroupMode } = useV2UserPreferences();

	if (!enabled) return null;

	const groupMode = preferences.sidebarGroupMode;

	return (
		<DropdownMenu>
			<Tooltip delayDuration={150}>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon-xs"
							aria-label="Group workspaces"
							className="no-drag text-muted-foreground hover:text-foreground"
						>
							<LuLayoutList className="size-3.5" />
						</Button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={6} showArrow={false}>
					Group workspaces
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent
				align="end"
				className="w-40"
				onCloseAutoFocus={(event) => event.preventDefault()}
			>
				<DropdownMenuLabel>Group by</DropdownMenuLabel>
				<DropdownMenuRadioGroup
					value={groupMode}
					onValueChange={(value) =>
						setSidebarGroupMode(value === "status" ? "status" : "project")
					}
				>
					<DropdownMenuRadioItem value="status">Status</DropdownMenuRadioItem>
					<DropdownMenuRadioItem value="project">Project</DropdownMenuRadioItem>
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
