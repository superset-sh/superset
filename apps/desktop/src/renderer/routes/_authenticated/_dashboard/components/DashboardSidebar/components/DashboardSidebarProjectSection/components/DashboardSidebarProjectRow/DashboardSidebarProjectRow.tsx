import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { HiChevronRight, HiMiniPlus } from "react-icons/hi2";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { RenameInput } from "renderer/screens/main/components/WorkspaceSidebar/RenameInput";

interface DashboardSidebarProjectRowProps {
	projectName: string;
	githubOwner: string | null;
	totalWorkspaceCount: number;
	isCollapsed: boolean;
	isRenaming: boolean;
	renameValue: string;
	onRenameValueChange: (value: string) => void;
	onSubmitRename: () => void;
	onCancelRename: () => void;
	onStartRename: () => void;
	onToggleCollapse: () => void;
	onNewWorkspace: () => void;
}

export function DashboardSidebarProjectRow({
	projectName,
	githubOwner,
	totalWorkspaceCount,
	isCollapsed,
	isRenaming,
	renameValue,
	onRenameValueChange,
	onSubmitRename,
	onCancelRename,
	onStartRename,
	onToggleCollapse,
	onNewWorkspace,
}: DashboardSidebarProjectRowProps) {
	return (
		<div
			className={cn(
				"flex items-center w-full pl-3 pr-2 py-1.5 text-sm font-medium",
				"hover:bg-muted/50 transition-colors",
			)}
		>
			{isRenaming ? (
				<div className="flex items-center gap-2 flex-1 min-w-0 py-0.5">
					<ProjectThumbnail
						projectName={projectName}
						githubOwner={githubOwner}
					/>
					<RenameInput
						value={renameValue}
						onChange={onRenameValueChange}
						onSubmit={onSubmitRename}
						onCancel={onCancelRename}
						className="h-6 px-1 py-0 text-sm -ml-1 font-medium bg-transparent border-none outline-none flex-1 min-w-0"
					/>
				</div>
			) : (
				<button
					type="button"
					onClick={onToggleCollapse}
					onDoubleClick={onStartRename}
					className="flex items-center gap-2 flex-1 min-w-0 py-0.5 text-left cursor-pointer"
				>
					<ProjectThumbnail
						projectName={projectName}
						githubOwner={githubOwner}
					/>
					<span className="truncate">{projectName}</span>
					<span className="text-xs text-muted-foreground tabular-nums font-normal">
						({totalWorkspaceCount})
					</span>
				</button>
			)}

			<Tooltip delayDuration={500}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation();
							onNewWorkspace();
						}}
						onContextMenu={(event) => event.stopPropagation()}
						className="p-1 rounded hover:bg-muted transition-colors shrink-0 ml-1"
					>
						<HiMiniPlus className="size-4 text-muted-foreground" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={4}>
					New workspace
				</TooltipContent>
			</Tooltip>

			<button
				type="button"
				onClick={onToggleCollapse}
				onContextMenu={(event) => event.stopPropagation()}
				aria-expanded={!isCollapsed}
				className="p-1 rounded hover:bg-muted transition-colors shrink-0 ml-1"
			>
				<HiChevronRight
					className={cn(
						"size-3.5 text-muted-foreground transition-transform duration-150",
						!isCollapsed && "rotate-90",
					)}
				/>
			</button>
		</div>
	);
}
