import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	LuLayers,
	LuPanelLeft,
	LuPanelLeftClose,
	LuPanelLeftOpen,
} from "react-icons/lu";
import { useWorkspaceSidebarStore } from "renderer/stores";
import {
	useCloseWorkspacesList,
	useCurrentView,
	useOpenWorkspacesList,
} from "renderer/stores/app-state";
import { STROKE_WIDTH, STROKE_WIDTH_THIN } from "../constants";
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
	const { toggleCollapsed } = useWorkspaceSidebarStore();
	const [isHovering, setIsHovering] = useState(false);

	const isWorkspacesListOpen = currentView === "workspaces-list";

	const handleClick = () => {
		if (isWorkspacesListOpen) {
			closeWorkspacesList();
		} else {
			openWorkspacesList();
		}
	};

	const handleToggleSidebar = () => {
		toggleCollapsed();
	};

	// Determine which icon to show based on collapsed state and hover
	const getToggleIcon = () => {
		if (isCollapsed) {
			// Collapsed: show panel-left normally, panel-left-open on hover
			return isHovering ? (
				<LuPanelLeftOpen className="size-4" strokeWidth={STROKE_WIDTH_THIN} />
			) : (
				<LuPanelLeft className="size-4" strokeWidth={STROKE_WIDTH_THIN} />
			);
		}
		// Open: show panel-left normally, panel-left-close on hover
		return isHovering ? (
			<LuPanelLeftClose className="size-4" strokeWidth={STROKE_WIDTH_THIN} />
		) : (
			<LuPanelLeft className="size-4" strokeWidth={STROKE_WIDTH_THIN} />
		);
	};

	if (isCollapsed) {
		return (
			<div className="flex flex-col items-center border-b border-border py-2 gap-2">
				{/* Toggle sidebar button */}
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleToggleSidebar}
							onMouseEnter={() => setIsHovering(true)}
							onMouseLeave={() => setIsHovering(false)}
							className="flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
						>
							{getToggleIcon()}
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">Toggle sidebar</TooltipContent>
				</Tooltip>

				{/* Workspaces button */}
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
							<LuLayers className="size-4" strokeWidth={STROKE_WIDTH} />
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">Workspaces</TooltipContent>
				</Tooltip>

				<NewWorkspaceButton isCollapsed />
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-1 border-b border-border px-2 pt-2 pb-2">
			{/* Toggle sidebar button */}
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={handleToggleSidebar}
						onMouseEnter={() => setIsHovering(true)}
						onMouseLeave={() => setIsHovering(false)}
						className="flex items-center gap-2 px-2 py-1.5 w-full rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
					>
						<div className="flex items-center justify-center size-5">
							{getToggleIcon()}
						</div>
						{isHovering && (
							<span className="text-sm font-medium flex-1 text-left">
								Toggle sidebar
							</span>
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="right">Toggle sidebar</TooltipContent>
			</Tooltip>

			{/* Workspaces button */}
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
					<LuLayers className="size-4" strokeWidth={STROKE_WIDTH} />
				</div>
				<span className="text-sm font-medium flex-1 text-left">Workspaces</span>
			</button>

			<NewWorkspaceButton />
		</div>
	);
}
