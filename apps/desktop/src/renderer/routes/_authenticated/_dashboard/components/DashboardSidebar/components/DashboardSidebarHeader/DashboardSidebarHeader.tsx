import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuFolderPlus } from "react-icons/lu";
import { OrganizationDropdown } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/OrganizationDropdown";

interface DashboardSidebarHeaderProps {
	isCollapsed?: boolean;
}

export function DashboardSidebarHeader({
	isCollapsed = false,
}: DashboardSidebarHeaderProps) {
	if (isCollapsed) {
		return (
			<div className="flex flex-col items-center gap-2 border-b border-border py-2">
				<OrganizationDropdown variant="collapsed" />

				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
						>
							<LuFolderPlus className="size-4" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">Add Repository</TooltipContent>
				</Tooltip>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-1 border-b border-border px-2 pt-2 pb-2">
			<div className="flex-1 min-w-0">
				<OrganizationDropdown variant="expanded" />
			</div>
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
					>
						<LuFolderPlus className="size-4" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="right">Add Repository</TooltipContent>
			</Tooltip>
		</div>
	);
}
