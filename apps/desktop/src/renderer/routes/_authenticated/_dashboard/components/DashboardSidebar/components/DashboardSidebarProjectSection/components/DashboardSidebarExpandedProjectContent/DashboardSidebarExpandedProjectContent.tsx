import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useLingui } from "@lingui/react/macro";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import {
	dropZoneId,
	parseId,
	useDashboardSidebarDnd,
} from "../../../../hooks/useSidebarDnd";
import { useDashboardSidebarSelection } from "../../../../providers/DashboardSidebarSelectionProvider";
import { WorkspaceBulkMenuScope } from "../../../DashboardSidebarWorkspaceItem/components/WorkspaceBulkMenuScope";
import { SidebarDropZone } from "../../../SidebarDropZone";
import { SortableSectionHeader } from "../../../SortableSectionHeader";
import { SortableWorkspaceItem } from "../../../SortableWorkspaceItem";

interface DashboardSidebarExpandedProjectContentProps {
	projectId: string;
	isCollapsed: boolean;
	workspaceShortcutLabels: Map<string, string>;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
	onDeleteSection: (sectionId: string) => void;
	onRenameSection: (sectionId: string, name: string) => void;
	onToggleSectionCollapse: (sectionId: string) => void;
}

export function DashboardSidebarExpandedProjectContent({
	projectId,
	isCollapsed,
	workspaceShortcutLabels,
	onWorkspaceHover,
	onDeleteSection,
	onRenameSection,
	onToggleSectionCollapse,
}: DashboardSidebarExpandedProjectContentProps) {
	const { t } = useLingui();
	const {
		projectItems,
		getProjectSortableItems,
		activeType,
		activeContainer,
		activeWorkspaceHome,
		groupInfo,
		collapsedSectionIds,
		workspacesById,
		sectionsById,
	} = useDashboardSidebarDnd();
	const flatItems = useMemo(
		() => projectItems[projectId] ?? [],
		[projectItems, projectId],
	);
	const sortableItems = getProjectSortableItems(projectId);
	const { isWorkspaceSelected, selectWorkspaceFromEvent } =
		useDashboardSidebarSelection();

	// A pinned workspace can only return to its home project; when every row
	// of that project is pinned, the empty list needs an explicit drop target.
	const dropZoneEligible =
		!isCollapsed && flatItems.length === 0 && activeWorkspaceHome === projectId;

	const selectableWorkspaceIds = useMemo(
		() =>
			flatItems.flatMap((id) => {
				const parsed = parseId(id);
				if (!parsed || parsed.type !== "workspace") return [];
				const workspace = workspacesById.get(parsed.realId);
				if (
					!workspace ||
					workspace.type !== "worktree" ||
					workspace.pendingTransaction?.type === "insert"
				) {
					return [];
				}
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
							<SortableContext
								items={sortableItems}
								strategy={verticalListSortingStrategy}
							>
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
									const sectionDragActive =
										activeType === "section" && activeContainer === projectId;
									const hidden =
										isInCollapsedSection || (sectionDragActive && isInSection);
									const canBulkSelect =
										workspace.type === "worktree" &&
										workspace.pendingTransaction?.type !== "insert";

									// The zero-height collapse lives inside the sortable wrapper
									// (see SortableWorkspaceItem) so the clip box moves with the
									// dnd translate — wrapping here would clip displaced rows
									// out of view mid-drag.
									return (
										<SortableWorkspaceItem
											key={String(id)}
											sortableId={String(id)}
											workspace={workspace}
											accentColor={group?.color}
											isInSection={isInSection}
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
																projectId,
																orderedWorkspaceIds: selectableWorkspaceIds,
															})
													: undefined
											}
											collapsed={hidden}
											collapseInstantly={sectionDragActive}
											disabled={
												hidden ||
												(workspace.type === "main" &&
													workspace.hostType === "local-device")
											}
										/>
									);
								})}
							</SortableContext>
							{dropZoneEligible && (
								<SidebarDropZone
									dropZoneId={dropZoneId(projectId)}
									label={t({
										id: "dashboard.sidebar.projectContent.dropToUnpin",
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
