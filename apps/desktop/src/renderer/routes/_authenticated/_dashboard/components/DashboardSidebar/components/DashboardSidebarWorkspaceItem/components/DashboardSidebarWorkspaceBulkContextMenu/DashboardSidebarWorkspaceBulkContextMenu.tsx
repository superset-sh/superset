import { Plural, Trans } from "@lingui/react/macro";
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
import { useBulkWorkspaceMoveActions } from "../../../../hooks/useBulkWorkspaceMoveActions";
import { useDashboardSidebarHoverActions } from "../../../../providers/DashboardSidebarHoverProvider";
import { useDashboardSidebarSelection } from "../../../../providers/DashboardSidebarSelectionProvider";
import { useBulkDeleteWorkspacesIntent } from "../../../../stores/bulkDeleteWorkspacesIntent";
import { useWorkspaceBulkMenuScope } from "../WorkspaceBulkMenuScope";

interface DashboardSidebarWorkspaceBulkContextMenuProps {
	children: ReactNode;
}

export function DashboardSidebarWorkspaceBulkContextMenu({
	children,
}: DashboardSidebarWorkspaceBulkContextMenuProps) {
	const scope = useWorkspaceBulkMenuScope();
	const { setContextMenuOpen } = useDashboardSidebarHoverActions();
	const { clearSelection } = useDashboardSidebarSelection();
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
	const openDeleteDialog = () =>
		useBulkDeleteWorkspacesIntent.getState().request(selectedWorkspaces);

	if (!scope) return children;

	const count = selectedWorkspaces.length;

	return (
		<ContextMenu onOpenChange={setContextMenuOpen}>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
				<ContextMenuSub>
					<ContextMenuSubTrigger>
						<LuArrowRightLeft className="size-4 mr-2" />
						<Trans>Move {count} to Group</Trans>
					</ContextMenuSubTrigger>
					<ContextMenuSubContent>
						<ContextMenuItem onSelect={createGroupFromSelection}>
							<LuFolderPlus className="size-4 mr-2" />
							<Trans>New group</Trans>
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
								{sectionMenuState === "empty" ? (
									<Trans>No groups yet</Trans>
								) : (
									<Trans>Loading groups…</Trans>
								)}
							</ContextMenuItem>
						)}
					</ContextMenuSubContent>
				</ContextMenuSub>
				{groupedWorkspaceIds.length > 0 && (
					<ContextMenuItem onSelect={ungroupSelection}>
						<LuArrowUp className="size-4 mr-2" />
						<Trans>Ungroup</Trans>
					</ContextMenuItem>
				)}
				<ContextMenuSeparator />
				<ContextMenuItem
					onSelect={openDeleteDialog}
					className="text-destructive focus:text-destructive"
				>
					<LuTrash2 className="size-4 mr-2 text-destructive" />
					<Plural
						value={count}
						one="Delete # Workspace"
						other="Delete # Workspaces"
					/>
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={clearSelection}>
					<LuX className="size-4 mr-2" />
					<Trans>Clear Selection</Trans>
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
