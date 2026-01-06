import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuLayers } from "react-icons/lu";
import { NewWorkspaceButton } from "./NewWorkspaceButton";

interface WorkspaceSidebarHeaderProps {
	isCollapsed?: boolean;
}

export function WorkspaceSidebarHeader({
	isCollapsed = false,
}: WorkspaceSidebarHeaderProps) {
	if (isCollapsed) {
		return (
			<div className="flex flex-col items-center border-b border-border py-2 gap-2">
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<div className="flex items-center justify-center size-8">
							<LuLayers className="size-4 text-muted-foreground" />
						</div>
					</TooltipTrigger>
					<TooltipContent side="right">Workspaces</TooltipContent>
				</Tooltip>
				<NewWorkspaceButton isCollapsed />
			</div>
		);
	}

	return (
		<div className="flex flex-col border-b border-border px-2 pt-2 pb-2">
			<div className="flex items-center gap-2 px-2 py-1.5">
				<div className="flex items-center justify-center size-5">
					<LuLayers className="size-4 text-muted-foreground" />
				</div>
				<span className="text-sm font-medium text-muted-foreground">
					Workspaces
				</span>
			</div>
			<NewWorkspaceButton />
		</div>
	);
}
