import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { cn } from "@superset/ui/utils";
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
									const hidden =
										isInCollapsedSection ||
										(activeType === "section" &&
											activeContainer === projectId &&
											isInSection);
									const canBulkSelect =
										workspace.type === "worktree" &&
										workspace.pendingTransaction?.type !== "insert";

									// Rows collapse via a CSS grid-row transition instead of a
									// per-row AnimatePresence/motion.div (~80 motion components
									// cost real render time). Hidden rows stay mounted: `inert`
									// removes them from focus/hit-testing and the disabled
									// sortable unregisters their droppable, matching the old
									// unmount behavior for DnD.
									return (
										<div
											key={String(id)}
											className={cn(
												"grid transition-[grid-template-rows,opacity] duration-150 ease-out",
												hidden
													? "grid-rows-[0fr] opacity-0"
													: "grid-rows-[1fr] opacity-100",
											)}
											inert={hidden}
										>
											<div className="min-h-0 overflow-hidden">
												<SortableWorkspaceItem
													sortableId={String(id)}
													workspace={workspace}
													accentColor={group?.color}
													isInSection={isInSection}
													onHoverCardOpen={onWorkspaceHover}
													shortcutLabel={workspaceShortcutLabels.get(
														parsed.realId,
													)}
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
													disabled={
														hidden ||
														(workspace.type === "main" &&
															workspace.hostType === "local-device")
													}
												/>
											</div>
										</div>
									);
								})}
							</SortableContext>
							{dropZoneEligible && (
								<SidebarDropZone
									dropZoneId={dropZoneId(projectId)}
									label="Drop to unpin"
								/>
							)}
						</WorkspaceBulkMenuScope>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
