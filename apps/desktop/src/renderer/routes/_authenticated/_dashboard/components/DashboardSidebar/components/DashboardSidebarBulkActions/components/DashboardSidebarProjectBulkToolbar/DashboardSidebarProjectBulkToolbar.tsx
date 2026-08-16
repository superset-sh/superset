import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuFolderInput, LuFolderPlus, LuUngroup, LuX } from "react-icons/lu";
import type {
	DashboardSidebarFolder,
	DashboardSidebarProject,
} from "../../../../types";
import { hasCustomColor } from "../../../../utils/folderColor";

interface DashboardSidebarProjectBulkToolbarProps {
	selectedProjects: DashboardSidebarProject[];
	folders: DashboardSidebarFolder[];
	onClearSelection: () => void;
	/** Move every selected project into a folder, or to the root when null. */
	onMoveToFolder: (folderId: string | null) => void;
	onCreateFolder: () => void;
}

/**
 * Replaces the PROJECTS header while projects are bulk-selected — the folder
 * counterpart of the workspace bulk toolbar above it in the tree.
 */
export function DashboardSidebarProjectBulkToolbar({
	selectedProjects,
	folders,
	onClearSelection,
	onMoveToFolder,
	onCreateFolder,
}: DashboardSidebarProjectBulkToolbarProps) {
	const count = selectedProjects.length;
	const noun = count === 1 ? "project" : "projects";
	const anyInFolder = selectedProjects.some(
		(project) => project.folderId !== null,
	);

	return (
		<div
			role="toolbar"
			aria-label="Selected project actions"
			className="flex min-h-8 w-full shrink-0 items-center gap-0.5 py-1 pl-2 pr-2"
		>
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onClearSelection}
						className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
						aria-label="Clear project selection"
					>
						<LuX className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">Clear selection (Esc)</TooltipContent>
			</Tooltip>

			<span className="min-w-0 flex-1 truncate pl-1 text-xs font-medium text-foreground">
				{count} {noun}
			</span>

			<div className="mx-1 h-4 w-px bg-border" />

			<DropdownMenu>
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
								aria-label={`Move ${count} selected ${noun} to a folder`}
							>
								<LuFolderInput className="size-3.5" />
							</button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent side="bottom">Move to folder</TooltipContent>
				</Tooltip>
				<DropdownMenuContent align="end" side="bottom" className="w-48">
					<DropdownMenuItem onSelect={onCreateFolder}>
						<LuFolderPlus className="size-4" />
						New folder
					</DropdownMenuItem>
					{folders.length > 0 && <DropdownMenuSeparator />}
					{folders.map((folder) => (
						<DropdownMenuItem
							key={folder.id}
							onSelect={() => onMoveToFolder(folder.id)}
						>
							<span
								className="size-2 shrink-0 rounded-full bg-muted-foreground/40"
								style={
									hasCustomColor(folder.color)
										? { backgroundColor: folder.color ?? undefined }
										: undefined
								}
							/>
							<span className="truncate">{folder.name}</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						disabled={!anyInFolder}
						onClick={() => onMoveToFolder(null)}
						className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
						aria-label="Remove selected projects from their folders"
					>
						<LuUngroup className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom">Remove from folder</TooltipContent>
			</Tooltip>
		</div>
	);
}
