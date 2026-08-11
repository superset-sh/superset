import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { type ReactNode, useMemo } from "react";
import {
	LuFolderInput,
	LuFolderPlus,
	LuTrash2,
	LuUngroup,
	LuX,
} from "react-icons/lu";
import { useBulkWorkspaceDeleteDialog } from "../../hooks/useBulkWorkspaceDeleteDialog";
import { useBulkWorkspaceMoveActions } from "../../hooks/useBulkWorkspaceMoveActions";
import { useDashboardSidebarSelection } from "../../providers/DashboardSidebarSelectionProvider";
import type {
	DashboardSidebarProject,
	DashboardSidebarWorkspace,
} from "../../types";
import { DashboardSidebarBulkDeleteDialog } from "../DashboardSidebarBulkDeleteDialog";

interface DashboardSidebarBulkActionsProps {
	projects: DashboardSidebarProject[];
	children: ReactNode;
}

export function DashboardSidebarBulkActions({
	projects,
	children,
}: DashboardSidebarBulkActionsProps) {
	const { clearSelection, removeSelectedWorkspaces, selectedProjectId } =
		useDashboardSidebarSelection();
	const selectedProject = useMemo(
		() => projects.find((project) => project.id === selectedProjectId) ?? null,
		[projects, selectedProjectId],
	);
	const { workspacesById, sectionIdByWorkspaceId } = useMemo(() => {
		const workspaceById = new Map<string, DashboardSidebarWorkspace>();
		const sectionByWorkspaceId = new Map<string, string>();

		for (const child of selectedProject?.children ?? []) {
			if (child.type === "workspace") {
				workspaceById.set(child.workspace.id, child.workspace);
				continue;
			}

			for (const workspace of child.section.workspaces) {
				workspaceById.set(workspace.id, workspace);
				sectionByWorkspaceId.set(workspace.id, child.section.id);
			}
		}

		return {
			workspacesById: workspaceById,
			sectionIdByWorkspaceId: sectionByWorkspaceId,
		};
	}, [selectedProject]);
	const {
		createGroupFromSelection,
		groupedWorkspaceIds,
		moveSelectionToSection,
		sectionMenuState,
		sections,
		selectedWorkspaces,
		ungroupSelection,
	} = useBulkWorkspaceMoveActions({
		projectId: selectedProjectId,
		workspacesById,
		sectionIdByWorkspaceId,
	});

	const { deleteDialogProps, openDeleteDialog } = useBulkWorkspaceDeleteDialog({
		selectedWorkspaces,
		onDeleted: removeSelectedWorkspaces,
	});

	return (
		<>
			{selectedWorkspaces.length === 0 ? (
				children
			) : (
				<div
					role="toolbar"
					aria-label="Selected workspace actions"
					className="flex min-h-8 w-full shrink-0 items-center gap-0.5 py-1 pl-2 pr-2"
				>
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={clearSelection}
								className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
								aria-label="Clear workspace selection"
							>
								<LuX className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom">Clear selection (Esc)</TooltipContent>
					</Tooltip>

					<span className="min-w-0 flex-1 truncate pl-1 text-xs font-medium text-foreground">
						{selectedWorkspaces.length}{" "}
						{selectedWorkspaces.length === 1 ? "workspace" : "workspaces"}
					</span>

					<div className="mx-1 h-4 w-px bg-border" />

					<DropdownMenu>
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
										aria-label={`Move ${selectedWorkspaces.length} selected ${selectedWorkspaces.length === 1 ? "workspace" : "workspaces"} to a group`}
									>
										<LuFolderInput className="size-3.5" />
									</button>
								</DropdownMenuTrigger>
							</TooltipTrigger>
							<TooltipContent side="bottom">Move to group</TooltipContent>
						</Tooltip>
						<DropdownMenuContent align="end" side="bottom" className="w-48">
							<DropdownMenuItem onSelect={createGroupFromSelection}>
								<LuFolderPlus className="size-4" />
								New group
							</DropdownMenuItem>
							{sectionMenuState === "populated" && <DropdownMenuSeparator />}
							{sections?.map((section) => (
								<DropdownMenuItem
									key={section.id}
									onSelect={() => moveSelectionToSection(section.id)}
								>
									<span
										className="size-2 shrink-0 rounded-full bg-muted-foreground/40"
										style={
											section.color
												? { backgroundColor: section.color }
												: undefined
										}
									/>
									<span className="truncate">{section.name}</span>
								</DropdownMenuItem>
							))}
							{sectionMenuState !== "populated" && (
								<DropdownMenuItem disabled>
									{sectionMenuState === "empty"
										? "No groups yet"
										: "Loading groups…"}
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>

					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								disabled={groupedWorkspaceIds.length === 0}
								onClick={ungroupSelection}
								className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
								aria-label="Ungroup selected workspaces"
							>
								<LuUngroup className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom">Ungroup</TooltipContent>
					</Tooltip>

					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={openDeleteDialog}
								className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
								aria-label="Delete selected workspaces"
							>
								<LuTrash2 className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom">Delete</TooltipContent>
					</Tooltip>
				</div>
			)}

			<DashboardSidebarBulkDeleteDialog {...deleteDialogProps} />
		</>
	);
}
