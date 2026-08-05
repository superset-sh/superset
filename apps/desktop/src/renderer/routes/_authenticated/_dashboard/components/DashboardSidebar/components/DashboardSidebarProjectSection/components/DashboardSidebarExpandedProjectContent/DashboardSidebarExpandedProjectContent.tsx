import { DndContext, DragOverlay } from "@dnd-kit/core";
import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { createPortal } from "react-dom";
import { useSidebarDnd } from "../../../../hooks/useSidebarDnd";
import { parseId } from "../../../../hooks/useSidebarDnd/useSidebarDnd";
import { useDashboardSidebarSelection } from "../../../../providers/DashboardSidebarSelectionProvider";
import type { DashboardSidebarProjectChild } from "../../../../types";
import { WorkspaceBulkMenuScope } from "../../../DashboardSidebarWorkspaceItem/components/WorkspaceBulkMenuScope";
import { SidebarDragOverlay } from "../../../SidebarDragOverlay";
import { SortableSectionHeader } from "../../../SortableSectionHeader";
import { SortableWorkspaceItem } from "../../../SortableWorkspaceItem";

interface DashboardSidebarExpandedProjectContentProps {
	projectId: string;
	isCollapsed: boolean;
	projectChildren: DashboardSidebarProjectChild[];
	workspaceShortcutLabels: Map<string, string>;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
	onDeleteSection: (sectionId: string) => void;
	onRenameSection: (sectionId: string, name: string) => void;
	onToggleSectionCollapse: (sectionId: string) => void;
}

export function DashboardSidebarExpandedProjectContent({
	projectId,
	isCollapsed,
	projectChildren,
	workspaceShortcutLabels,
	onWorkspaceHover,
	onDeleteSection,
	onRenameSection,
	onToggleSectionCollapse,
}: DashboardSidebarExpandedProjectContentProps) {
	const {
		sensors,
		measuring,
		collisionDetection,
		flatItems,
		sortableItems,
		activeId,
		activeType,
		activeItem,
		predictedColor,
		groupInfo,
		collapsedSectionIds,
		workspacesById,
		sectionsById,
		handlers,
	} = useSidebarDnd({ projectId, projectChildren });
	const { isWorkspaceSelected, selectWorkspaceFromEvent } =
		useDashboardSidebarSelection();

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
							<DndContext
								sensors={sensors}
								collisionDetection={collisionDetection}
								measuring={measuring}
								{...handlers}
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
											(activeType === "section" && isInSection);
										const canBulkSelect =
											workspace.type === "worktree" &&
											workspace.pendingTransaction?.type !== "insert";

										return (
											<AnimatePresence key={String(id)} initial={false}>
												{!hidden && (
													<motion.div
														initial={{ height: 0, opacity: 0 }}
														animate={{ height: "auto", opacity: 1 }}
														exit={{ height: 0, opacity: 0 }}
														transition={{ duration: 0.15, ease: "easeOut" }}
													>
														<SortableWorkspaceItem
															sortableId={String(id)}
															workspace={workspace}
															accentColor={
																activeId === id ? predictedColor : group?.color
															}
															isInSection={groupInfo.has(parsed.realId)}
															onHoverCardOpen={() =>
																onWorkspaceHover(parsed.realId)
															}
															shortcutLabel={workspaceShortcutLabels.get(
																parsed.realId,
															)}
															isSelected={
																canBulkSelect &&
																isWorkspaceSelected(parsed.realId)
															}
															onSelectionClick={
																canBulkSelect
																	? (event) =>
																			selectWorkspaceFromEvent(event, {
																				workspaceId: parsed.realId,
																				projectId,
																				orderedWorkspaceIds:
																					selectableWorkspaceIds,
																			})
																	: undefined
															}
															disabled={
																workspace.type === "main" &&
																workspace.hostType === "local-device"
															}
														/>
													</motion.div>
												)}
											</AnimatePresence>
										);
									})}
								</SortableContext>

								{createPortal(
									<DragOverlay dropAnimation={null}>
										{activeId ? (
											<SidebarDragOverlay activeItem={activeItem} />
										) : null}
									</DragOverlay>,
									document.body,
								)}
							</DndContext>
						</WorkspaceBulkMenuScope>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
