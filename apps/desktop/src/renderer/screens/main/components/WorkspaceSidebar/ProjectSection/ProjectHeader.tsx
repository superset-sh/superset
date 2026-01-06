import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { LuFolderOpen, LuSettings, LuX } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import { useOpenSettings } from "renderer/stores/app-state";

interface ProjectHeaderProps {
	projectId: string;
	projectName: string;
	mainRepoPath: string;
	isCollapsed: boolean;
	onToggleCollapse: () => void;
	workspaceCount: number;
}

export function ProjectHeader({
	projectId,
	projectName,
	mainRepoPath,
	isCollapsed,
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
