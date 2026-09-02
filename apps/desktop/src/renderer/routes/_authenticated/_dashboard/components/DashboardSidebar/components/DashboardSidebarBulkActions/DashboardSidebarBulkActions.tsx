import { plural } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
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
	const { t } = useLingui();
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
					aria-label={t({
						id: "dashboard.sidebar.bulkActions.toolbarAriaLabel",
						message: "Selected workspace actions",
					})}
					// Sticky: the toolbar's natural slot (the Workspaces header) can be
					// scrolled far out of view when selecting rows at the bottom of a
					// long sidebar — pin it to the scroller top so the selection always
					// has visible actions.
					className="sticky top-0 z-10 flex h-7 w-full shrink-0 items-center gap-0.5 bg-background/85 pl-2 pr-2 backdrop-blur-sm"
				>
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={clearSelection}
								className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
								aria-label={t({
									id: "dashboard.sidebar.bulkActions.clearSelectionAriaLabel",
									message: "Clear workspace selection",
								})}
							>
								<LuX className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<Trans id="dashboard.sidebar.bulkActions.clearSelection">
								Clear selection (Esc)
							</Trans>
						</TooltipContent>
					</Tooltip>

					<span className="min-w-0 flex-1 truncate pl-1 text-xs font-medium text-foreground">
						<Plural
							id="dashboard.sidebar.bulkActions.selectedCount"
							value={selectedWorkspaces.length}
							one="# workspace"
							other="# workspaces"
						/>
					</span>

					<div className="mx-1 h-4 w-px bg-border" />

					<DropdownMenu>
						<Tooltip delayDuration={300}>
							<TooltipTrigger asChild>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
										aria-label={t({
											id: "dashboard.sidebar.bulkActions.moveToGroupAriaLabel",
											message: plural(selectedWorkspaces.length, {
												one: "Move # selected workspace to a group",
												other: "Move # selected workspaces to a group",
											}),
										})}
									>
										<LuFolderInput className="size-3.5" />
									</button>
								</DropdownMenuTrigger>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								<Trans id="dashboard.sidebar.bulkActions.moveToGroup">
									Move to group
								</Trans>
							</TooltipContent>
						</Tooltip>
						<DropdownMenuContent align="end" side="bottom" className="w-48">
							<DropdownMenuItem onSelect={createGroupFromSelection}>
								<LuFolderPlus className="size-4" />
								<Trans id="dashboard.sidebar.bulkActions.newGroup">
									New group
								</Trans>
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
									{sectionMenuState === "empty" ? (
										<Trans id="dashboard.sidebar.bulkActions.noGroupsYet">
											No groups yet
										</Trans>
									) : (
										<Trans id="dashboard.sidebar.bulkActions.loadingGroups">
											Loading groups…
										</Trans>
									)}
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
								aria-label={t({
									id: "dashboard.sidebar.bulkActions.ungroupAriaLabel",
									message: "Ungroup selected workspaces",
								})}
							>
								<LuUngroup className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<Trans id="dashboard.sidebar.bulkActions.ungroup">Ungroup</Trans>
						</TooltipContent>
					</Tooltip>

					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={openDeleteDialog}
								className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
								aria-label={t({
									id: "dashboard.sidebar.bulkActions.deleteAriaLabel",
									message: "Delete selected workspaces",
								})}
							>
								<LuTrash2 className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<Trans id="dashboard.sidebar.bulkActions.delete">Delete</Trans>
						</TooltipContent>
					</Tooltip>
				</div>
			)}

			<DashboardSidebarBulkDeleteDialog {...deleteDialogProps} />
		</>
	);
}
