import type { SelectCloudWorkspace } from "@superset/db/schema";
import { Button } from "@superset/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { cn } from "@superset/ui/utils";
import { formatDistanceToNow } from "date-fns";
import {
	HiOutlineCloud,
	HiOutlinePause,
	HiOutlinePlay,
	HiOutlineStop,
	HiOutlineTrash,
} from "react-icons/hi2";
import { GoGitBranch } from "react-icons/go";
import {
	useDeleteCloudWorkspace,
	usePauseCloudWorkspace,
	useResumeCloudWorkspace,
	useStopCloudWorkspace,
} from "renderer/react-query/cloud-workspaces";
import { CloudWorkspaceStatusBadge } from "../CloudWorkspaceStatusBadge";

interface CloudWorkspaceListItemProps {
	workspace: SelectCloudWorkspace;
	isSelected?: boolean;
	onSelect?: () => void;
	onConnect?: () => void;
}

export function CloudWorkspaceListItem({
	workspace,
	isSelected,
	onSelect,
	onConnect,
}: CloudWorkspaceListItemProps) {
	const pauseWorkspace = usePauseCloudWorkspace();
	const resumeWorkspace = useResumeCloudWorkspace();
	const stopWorkspace = useStopCloudWorkspace();
	const deleteWorkspace = useDeleteCloudWorkspace();

	const canPause = workspace.status === "running";
	const canResume = workspace.status === "paused";
	const canStop =
		workspace.status === "running" || workspace.status === "paused";
	const canConnect = workspace.status === "running";
	const canDelete =
		workspace.status === "stopped" || workspace.status === "error";

	const handlePause = () => {
		pauseWorkspace.mutate({ workspaceId: workspace.id });
	};

	const handleResume = () => {
		resumeWorkspace.mutate({ workspaceId: workspace.id });
	};

	const handleStop = () => {
		stopWorkspace.mutate({ workspaceId: workspace.id });
	};

	const handleDelete = () => {
		deleteWorkspace.mutate({ workspaceId: workspace.id });
	};

	const lastActiveText = workspace.lastActiveAt
		? `Active ${formatDistanceToNow(new Date(workspace.lastActiveAt), { addSuffix: true })}`
		: null;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<button
					type="button"
					onClick={onSelect}
					onDoubleClick={canConnect ? onConnect : undefined}
					className={cn(
						"w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors",
						"hover:bg-accent",
						isSelected && "bg-accent",
					)}
				>
					<div className="flex-shrink-0">
						<HiOutlineCloud className="h-4 w-4 text-muted-foreground" />
					</div>

					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2">
							<span className="font-medium truncate">{workspace.name}</span>
							<CloudWorkspaceStatusBadge
								status={workspace.status}
								showLabel={false}
								size="sm"
							/>
						</div>
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<GoGitBranch className="h-3 w-3" />
							<span className="truncate">{workspace.branch}</span>
							{lastActiveText && (
								<>
									<span>-</span>
									<span>{lastActiveText}</span>
								</>
							)}
						</div>
					</div>

					{canConnect && (
						<Button
							size="sm"
							variant="ghost"
							className="flex-shrink-0 h-7"
							onClick={(e: React.MouseEvent) => {
								e.stopPropagation();
								onConnect?.();
							}}
						>
							Connect
						</Button>
					)}
				</button>
			</ContextMenuTrigger>

			<ContextMenuContent>
				{canConnect && (
					<ContextMenuItem onClick={onConnect}>
						<HiOutlinePlay className="h-4 w-4 mr-2" />
						Connect
					</ContextMenuItem>
				)}
				{canPause && (
					<ContextMenuItem onClick={handlePause}>
						<HiOutlinePause className="h-4 w-4 mr-2" />
						Pause
					</ContextMenuItem>
				)}
				{canResume && (
					<ContextMenuItem onClick={handleResume}>
						<HiOutlinePlay className="h-4 w-4 mr-2" />
						Resume
					</ContextMenuItem>
				)}
				{canStop && (
					<ContextMenuItem onClick={handleStop}>
						<HiOutlineStop className="h-4 w-4 mr-2" />
						Stop
					</ContextMenuItem>
				)}
				{(canConnect || canPause || canResume || canStop) && canDelete && (
					<ContextMenuSeparator />
				)}
				{canDelete && (
					<ContextMenuItem
						onClick={handleDelete}
						className="text-destructive focus:text-destructive"
					>
						<HiOutlineTrash className="h-4 w-4 mr-2" />
						Delete
					</ContextMenuItem>
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
}
