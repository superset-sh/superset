import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import type { ReactNode } from "react";
import {
	LuArrowRightLeft,
	LuArrowUp,
	LuFolderPlus,
	LuTrash2,
	LuX,
} from "react-icons/lu";
import { useBulkWorkspaceDeleteDialog } from "../../../../hooks/useBulkWorkspaceDeleteDialog";
import { useBulkWorkspaceMoveActions } from "../../../../hooks/useBulkWorkspaceMoveActions";
import { useDashboardSidebarHover } from "../../../../providers/DashboardSidebarHoverProvider";
import { useDashboardSidebarSelection } from "../../../../providers/DashboardSidebarSelectionProvider";
import { DashboardSidebarBulkDeleteDialog } from "../../../DashboardSidebarBulkDeleteDialog";
import { useWorkspaceBulkMenuScope } from "../WorkspaceBulkMenuScope";

interface DashboardSidebarWorkspaceBulkContextMenuProps {
	children: ReactNode;
}

export function DashboardSidebarWorkspaceBulkContextMenu({
	children,
}: DashboardSidebarWorkspaceBulkContextMenuProps) {
	const scope = useWorkspaceBulkMenuScope();
	const { setContextMenuOpen } = useDashboardSidebarHover();
	const { clearSelection, removeSelectedWorkspaces } =
		useDashboardSidebarSelection();
	const {
		createGroupFromSelection,
		groupedWorkspaceIds,
		moveSelectionToSection,
		sectionMenuState,
		sections,
		selectedWorkspaces,
		ungroupSelection,
	} = useBulkWorkspaceMoveActions({
		projectId: scope?.projectId ?? null,
		workspacesById: scope?.workspacesById ?? new Map(),
		sectionIdByWorkspaceId: scope?.sectionIdByWorkspaceId ?? new Map(),
	});
	const { deleteDialogProps, openDeleteDialog } = useBulkWorkspaceDeleteDialog({
		selectedWorkspaces,
		onDeleted: removeSelectedWorkspaces,
	});

	if (!scope) return children;

	const count = selectedWorkspaces.length;
	const workspaceLabel = count === 1 ? "Workspace" : "Workspaces";

	return (
		<>
			<ContextMenu onOpenChange={setContextMenuOpen}>
				<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
				<ContextMenuContent
					onCloseAutoFocus={(event) => event.preventDefault()}
				>
					<ContextMenuSub>
						<ContextMenuSubTrigger>
							<LuArrowRightLeft className="size-4 mr-2" />
							Move {count} to Group
						</ContextMenuSubTrigger>
						<ContextMenuSubContent>
							<ContextMenuItem onSelect={createGroupFromSelection}>
								<LuFolderPlus className="size-4 mr-2" />
								New group
							</ContextMenuItem>
							{sectionMenuState === "populated" && <ContextMenuSeparator />}
							{sections?.map((section) => (
								<ContextMenuItem
									key={section.id}
									onSelect={() => moveSelectionToSection(section.id)}
								>
									{section.color && (
										<span
											className="size-2 shrink-0 rounded-full mr-2"
											style={{ backgroundColor: section.color }}
										/>
									)}
									{section.name}
								</ContextMenuItem>
							))}
							{sectionMenuState !== "populated" && (
								<ContextMenuItem disabled>
									{sectionMenuState === "empty"
										? "No groups yet"
										: "Loading groups…"}
								</ContextMenuItem>
							)}
						</ContextMenuSubContent>
					</ContextMenuSub>
					{groupedWorkspaceIds.length > 0 && (
						<ContextMenuItem onSelect={ungroupSelection}>
							<LuArrowUp className="size-4 mr-2" />
							Ungroup
						</ContextMenuItem>
					)}
					<ContextMenuSeparator />
					<ContextMenuItem
						onSelect={openDeleteDialog}
						className="text-destructive focus:text-destructive"
					>
						<LuTrash2 className="size-4 mr-2 text-destructive" />
						Delete {count} {workspaceLabel}
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem onSelect={clearSelection}>
						<LuX className="size-4 mr-2" />
						Clear Selection
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			<DashboardSidebarBulkDeleteDialog {...deleteDialogProps} />
		</>
	);
}
