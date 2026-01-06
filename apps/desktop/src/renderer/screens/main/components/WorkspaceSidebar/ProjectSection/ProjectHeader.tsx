import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuFolderOpen, LuSettings, LuX } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import { useOpenSettings } from "renderer/stores/app-state";
import { ProjectThumbnail } from "./ProjectThumbnail";

interface ProjectHeaderProps {
	projectId: string;
	projectName: string;
	githubOwner: string | null;
	mainRepoPath: string;
	/** Whether the project section is collapsed (workspaces hidden) */
	isCollapsed: boolean;
	/** Whether the sidebar is in collapsed mode (icon-only view) */
	isSidebarCollapsed?: boolean;
	onToggleCollapse: () => void;
	workspaceCount: number;
	onNewWorkspace: () => void;
	onQuickCreate: () => void;
	isCreating: boolean;
	dropdownOpen: boolean;
	onDropdownOpenChange: (open: boolean) => void;
}

export function ProjectHeader({
	projectId,
	projectName,
	githubOwner,
	mainRepoPath,
	isCollapsed,
	isSidebarCollapsed = false,
	onToggleCollapse,
	workspaceCount,
}: ProjectHeaderProps) {
	const utils = trpc.useUtils();
	const openSettings = useOpenSettings();

	const closeProject = trpc.projects.close.useMutation({
		onSuccess: (data) => {
			utils.workspaces.getAllGrouped.invalidate();
			utils.workspaces.getActive.invalidate();
			utils.projects.getRecents.invalidate();
			if (data.terminalWarning) {
				toast.warning(data.terminalWarning);
			}
		},
		onError: (error) => {
			toast.error(`Failed to close project: ${error.message}`);
		},
	});

	const openInFinder = trpc.external.openInFinder.useMutation({
		onError: (error) => toast.error(`Failed to open: ${error.message}`),
	});

	const handleCloseProject = () => {
		closeProject.mutate({ id: projectId });
	};

	const handleOpenInFinder = () => {
		openInFinder.mutate(mainRepoPath);
	};

	const handleOpenSettings = () => {
		openSettings("project");
	};

	// Collapsed sidebar: show just the thumbnail with tooltip
	if (isSidebarCollapsed) {
		return (
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onToggleCollapse}
						className={cn(
							"flex items-center justify-center size-8 rounded-md",
							"hover:bg-muted/50 transition-colors",
						)}
					>
						<ProjectThumbnail
							projectId={projectId}
							projectName={projectName}
							githubOwner={githubOwner}
						/>
					</button>
				</TooltipTrigger>
				<TooltipContent side="right" className="flex flex-col gap-0.5">
					<span className="font-medium">{projectName}</span>
					<span className="text-xs text-muted-foreground">
						{workspaceCount} workspace{workspaceCount !== 1 ? "s" : ""}
					</span>
				</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<button
					type="button"
					onClick={onToggleCollapse}
					aria-expanded={!isCollapsed}
					className={cn(
						"flex items-center gap-2 w-full px-3 py-2 text-sm font-medium",
						"hover:bg-muted/50 transition-colors",
						"text-left cursor-pointer",
					)}
				>
					<ProjectThumbnail
						projectId={projectId}
						projectName={projectName}
						githubOwner={githubOwner}
					/>
					<span className="truncate flex-1">{projectName}</span>
					<span className="text-xs text-muted-foreground">
						{workspaceCount}
					</span>
				</button>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onSelect={handleOpenInFinder}>
					<LuFolderOpen className="size-4 mr-2" />
					Open in Finder
				</ContextMenuItem>
				<ContextMenuItem onSelect={handleOpenSettings}>
					<LuSettings className="size-4 mr-2" />
					Project Settings
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem
					onSelect={handleCloseProject}
					disabled={closeProject.isPending}
					className="text-destructive focus:text-destructive"
				>
					<LuX className="size-4 mr-2" />
					{closeProject.isPending ? "Closing..." : "Close Project"}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
