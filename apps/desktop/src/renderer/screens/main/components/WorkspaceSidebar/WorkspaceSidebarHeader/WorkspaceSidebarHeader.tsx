import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuLayers } from "react-icons/lu";
import {
	useCloseWorkspacesList,
	useCurrentView,
	useOpenWorkspacesList,
} from "renderer/stores/app-state";
import { NewWorkspaceButton } from "./NewWorkspaceButton";

interface WorkspaceSidebarHeaderProps {
	isCollapsed?: boolean;
}

export function WorkspaceSidebarHeader({
	isCollapsed = false,
}: WorkspaceSidebarHeaderProps) {
	const currentView = useCurrentView();
	const openWorkspacesList = useOpenWorkspacesList();
	const closeWorkspacesList = useCloseWorkspacesList();

	const isWorkspacesListOpen = currentView === "workspaces-list";

	const handleClick = () => {
		if (isWorkspacesListOpen) {
			closeWorkspacesList();
		} else {
			openWorkspacesList();
		}
	};

	if (isCollapsed) {
		return (
			<div className="flex flex-col items-center border-b border-border py-2 gap-2">
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleClick}
							className={cn(
								"flex items-center justify-center size-8 rounded-md transition-colors",
								isWorkspacesListOpen
									? "text-foreground bg-accent"
									: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
							)}
						>
							<LuLayers className="size-4" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">Workspaces</TooltipContent>
				</Tooltip>
				<NewWorkspaceButton isCollapsed />
			</div>
		);
	}

	return (
		<div className="flex flex-col border-b border-border px-2 pt-2 pb-2">
			<button
				type="button"
				onClick={handleClick}
				className={cn(
					"flex items-center gap-2 px-2 py-1.5 w-full rounded-md transition-colors",
					isWorkspacesListOpen
						? "text-foreground bg-accent"
						: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
				)}
			>
				<div className="flex items-center justify-center size-5">
					<LuLayers className="size-4" />
				</div>
				<span className="text-sm font-medium flex-1 text-left">Workspaces</span>
			</button>
			<NewWorkspaceButton />
		</div>
	);
}
