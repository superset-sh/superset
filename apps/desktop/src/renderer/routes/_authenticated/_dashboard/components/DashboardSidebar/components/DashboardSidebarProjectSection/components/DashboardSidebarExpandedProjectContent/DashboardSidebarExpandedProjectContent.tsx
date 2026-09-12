import { SortableContext } from "@dnd-kit/sortable";
import { useLingui } from "@lingui/react/macro";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import {
	dropZoneId,
	parseId,
	SESSIONS_CONTAINER,
	useDashboardSidebarDnd,
} from "../../../../hooks/useSidebarDnd";
import { useDashboardSidebarSelection } from "../../../../providers/DashboardSidebarSelectionProvider";
import type {
	DashboardSidebarWorkspace,
	DashboardSidebarWorkspaceIndentation,
} from "../../../../types";
import { WorkspaceBulkMenuScope } from "../../../DashboardSidebarWorkspaceItem/components/WorkspaceBulkMenuScope";
import { SidebarDropZone } from "../../../SidebarDropZone";
import { SortableSectionHeader } from "../../../SortableSectionHeader";
import { SortableWorkspaceItem } from "../../../SortableWorkspaceItem";

/** Main rows are never bulk-selected; sessions and worktrees are. */
const isBulkSelectable = (workspace: DashboardSidebarWorkspace) =>
	workspace.type !== "main" && workspace.pendingTransaction?.type !== "insert";

interface DashboardSidebarExpandedProjectContentProps {
	/** DnD container: a project id, or SESSIONS_CONTAINER for the Sessions lane. */
	containerId: string;
	/** Lane the rows are filed under: the project id, or null for sessions. */
	projectId: string | null;
	isCollapsed: boolean;
	/**
	 * Row indentation overrides; the Sessions lane sits flush with its header.
	 * Folder headers share the top-level column so they read as siblings of
	 * the ungrouped rows.
	 */
	topLevelIndentation?: Exclude<
		DashboardSidebarWorkspaceIndentation,
		"grouped"
	>;
	groupedIndentation?: DashboardSidebarWorkspaceIndentation;
	workspaceShortcutLabels: Map<string, string>;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
	onDeleteSection: (sectionId: string) => void;
	onRenameSection: (sectionId: string, name: string) => void;
	onToggleSectionCollapse: (sectionId: string) => void;
}

/**
 * The sortable row list of one DnD container — every project, and the
 * Sessions lane. Ungrouped rows and folder headers are flat siblings so a
 * folder drag can move whole groups as units (see useSidebarDnd).
 */
export function DashboardSidebarExpandedProjectContent({
	containerId,
	projectId,
	isCollapsed,
	topLevelIndentation,
	groupedIndentation,
	workspaceShortcutLabels,
	onWorkspaceHover,
	onDeleteSection,
	onRenameSection,
	onToggleSectionCollapse,
}: DashboardSidebarExpandedProjectContentProps) {
	const { t } = useLingui();
	const {
		projectItems,
		sessionItems,
		getContainerSortingStrategy,
		activeSectionId,
		activeWorkspaceHome,
		groupInfo,
		collapsedSectionIds,
		workspacesById,
		sectionsById,
	} = useDashboardSidebarDnd();
	const flatItems = useMemo(
		() =>
			containerId === SESSIONS_CONTAINER
				? sessionItems
				: (projectItems[containerId] ?? []),
		[projectItems, sessionItems, containerId],
	);
	const sortingStrategy = getContainerSortingStrategy(containerId);
	const { isWorkspaceSelected, selectWorkspaceFromEvent } =
		useDashboardSidebarSelection();

	// A pinned workspace can only return to its home container; when every row
	// of that container is pinned, the empty list needs an explicit drop target.
	const dropZoneEligible =
		!isCollapsed &&
		flatItems.length === 0 &&
		activeWorkspaceHome === containerId;

	const selectableWorkspaceIds = useMemo(
		() =>
			flatItems.flatMap((id) => {
				const parsed = parseId(id);
				if (!parsed || parsed.type !== "workspace") return [];
				const workspace = workspacesById.get(parsed.realId);
				if (!workspace || !isBulkSelectable(workspace)) return [];
				const group = groupInfo.get(parsed.realId);
				if (group && collapsedSectionIds.has(group.sectionId)) return [];
				return [parsed.realId];
			}),
		[flatItems, workspacesById, groupInfo, collapsedSectionIds],
	);

	return (
		<AnimatePresence initial={false}>
			{!isCollapsed && (
				<motion.div
					initial={{ height: 0, opacity: 0 }}
					animate={{ height: "auto", opacity: 1 }}
					exit={{ height: 0, opacity: 0 }}
					transition={{ duration: 0.15, ease: "easeOut" }}
					className="overflow-hidden"
				>
					<div className="pb-1">
						<WorkspaceBulkMenuScope
							projectId={projectId}
							workspacesById={workspacesById}
							groupInfo={groupInfo}
						>
							<SortableContext items={flatItems} strategy={sortingStrategy}>
								{flatItems.map((id) => {
									const parsed = parseId(id);
									if (!parsed) return null;

									if (parsed.type === "section") {
										const section = sectionsById.get(parsed.realId);
										if (!section) return null;
										return (
											<SortableSectionHeader
												key={String(id)}
												sortableId={String(id)}
												section={section}
												indentation={topLevelIndentation}
												onDelete={onDeleteSection}
												onRename={onRenameSection}
												onToggleCollapse={onToggleSectionCollapse}
											/>
										);
									}

									const workspace = workspacesById.get(parsed.realId);
									if (!workspace) return null;
									const group = groupInfo.get(parsed.realId);
									const isInSection = !!group;
									const isInCollapsedSection =
										isInSection && collapsedSectionIds.has(group.sectionId);
									const inDraggedSection =
										isInSection && group.sectionId === activeSectionId;
									const canBulkSelect = isBulkSelectable(workspace);

									// The zero-height collapse lives inside the sortable wrapper
									// (see SortableWorkspaceItem) so the clip box moves with the
									// dnd translate — wrapping here would clip displaced rows
									// out of view mid-drag. Rows stay mounted and full-height
									// during a section drag: the group travels as a block.
									return (
										<SortableWorkspaceItem
											key={String(id)}
											sortableId={String(id)}
											workspace={workspace}
											accentColor={group?.color}
											isInSection={isInSection}
											indentation={
												isInSection ? groupedIndentation : topLevelIndentation
											}
											onHoverCardOpen={onWorkspaceHover}
											shortcutLabel={workspaceShortcutLabels.get(parsed.realId)}
											isSelected={
												canBulkSelect && isWorkspaceSelected(parsed.realId)
											}
											onSelectionClick={
												canBulkSelect
													? (event) =>
															selectWorkspaceFromEvent(event, {
																workspaceId: parsed.realId,
																projectId: containerId,
																orderedWorkspaceIds: selectableWorkspaceIds,
															})
													: undefined
											}
											collapsed={isInCollapsedSection}
											isDragPlaceholder={inDraggedSection}
											disabled={
												isInCollapsedSection ||
												(workspace.type === "main" &&
													workspace.hostType === "local-device")
											}
										/>
									);
								})}
							</SortableContext>
							{dropZoneEligible && (
								<SidebarDropZone
									dropZoneId={dropZoneId(containerId)}
									label={t({
										message: "Drop to unpin",
									})}
								/>
							)}
						</WorkspaceBulkMenuScope>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
