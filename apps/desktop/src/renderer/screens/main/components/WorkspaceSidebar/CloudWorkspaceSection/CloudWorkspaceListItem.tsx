import type { SelectCloudWorkspace } from "@superset/db/schema";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import {
	LuCloud,
	LuEllipsisVertical,
	LuPause,
	LuPlay,
	LuSquare,
	LuTerminal,
	LuTrash2,
} from "react-icons/lu";
import { useCloudWorkspaceMutations } from "renderer/react-query/cloud-workspaces";

interface CloudWorkspaceListItemProps {
	workspace: SelectCloudWorkspace;
	isCollapsed?: boolean;
	onConnect?: (workspaceId: string) => void;
}

const statusColors: Record<string, string> = {
	running: "bg-green-500",
	paused: "bg-yellow-500",
	stopped: "bg-gray-500",
	provisioning: "bg-blue-500",
	error: "bg-red-500",
};

const statusLabels: Record<string, string> = {
	running: "Running",
	paused: "Paused",
	stopped: "Stopped",
	provisioning: "Provisioning...",
	error: "Error",
};

export function CloudWorkspaceListItem({
	workspace,
	isCollapsed = false,
	onConnect,
}: CloudWorkspaceListItemProps) {
	const { pauseWorkspace, resumeWorkspace, stopWorkspace, deleteWorkspace } =
		useCloudWorkspaceMutations();

	const handleConnect = () => {
		onConnect?.(workspace.id);
	};

	const handlePause = () => {
		pauseWorkspace.mutate(workspace.id);
	};

	const handleResume = () => {
		resumeWorkspace.mutate(workspace.id);
	};

	const handleStop = () => {
		stopWorkspace.mutate(workspace.id);
	};

	const handleDelete = () => {
		deleteWorkspace.mutate(workspace.id);
	};

	const isRunning = workspace.status === "running";
	const isPaused = workspace.status === "paused";
	const _isStopped = workspace.status === "stopped";
	const canConnect = isRunning;
	const canPause = isRunning;
	const canResume = isPaused;
	const canStop = isRunning || isPaused;

	if (isCollapsed) {
		return (
			<div className="px-2 py-1">
				<Button
					variant="ghost"
					size="icon"
					className="size-8 relative"
					onClick={canConnect ? handleConnect : undefined}
					disabled={!canConnect}
				>
					<LuCloud className="size-4" />
					<span
						className={cn(
							"absolute bottom-1 right-1 size-2 rounded-full",
							statusColors[workspace.status] ?? "bg-gray-500",
						)}
					/>
				</Button>
			</div>
		);
	}

	return (
		<div className="group flex items-center gap-2 px-3 py-1.5 hover:bg-accent/50 rounded-sm">
			<div className="flex items-center gap-2 flex-1 min-w-0">
				<div className="relative">
					<LuCloud className="size-4 text-muted-foreground" />
					<span
						className={cn(
							"absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-background",
							statusColors[workspace.status] ?? "bg-gray-500",
						)}
					/>
				</div>
				<div className="flex-1 min-w-0">
					<div className="text-sm truncate">{workspace.name}</div>
					<div className="text-xs text-muted-foreground truncate">
						{statusLabels[workspace.status] ?? workspace.status}
						{workspace.branch && ` • ${workspace.branch}`}
					</div>
				</div>
			</div>

			<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
				{canConnect && (
					<Button
						variant="ghost"
						size="icon"
						className="size-6"
						onClick={handleConnect}
					>
						<LuTerminal className="size-3.5" />
					</Button>
				)}

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon" className="size-6">
							<LuEllipsisVertical className="size-3.5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-40">
						{canConnect && (
							<DropdownMenuItem onClick={handleConnect}>
								<LuTerminal className="size-4 mr-2" />
								Connect
							</DropdownMenuItem>
						)}
						{canPause && (
							<DropdownMenuItem onClick={handlePause}>
								<LuPause className="size-4 mr-2" />
								Pause
							</DropdownMenuItem>
						)}
						{canResume && (
							<DropdownMenuItem onClick={handleResume}>
								<LuPlay className="size-4 mr-2" />
								Resume
							</DropdownMenuItem>
						)}
						{canStop && (
							<DropdownMenuItem onClick={handleStop}>
								<LuSquare className="size-4 mr-2" />
								Stop
							</DropdownMenuItem>
						)}
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={handleDelete}
							className="text-destructive focus:text-destructive"
						>
							<LuTrash2 className="size-4 mr-2" />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
