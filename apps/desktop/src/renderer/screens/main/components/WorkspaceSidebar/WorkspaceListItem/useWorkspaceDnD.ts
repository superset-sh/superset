import { toast } from "@superset/ui/sonner";
import { useCallback, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	useMoveWorkspacesToSection,
	useMoveWorkspaceToSectionAtIndex,
	useReorderProjectChildren,
	useReorderWorkspacesInSection,
} from "renderer/react-query/workspaces";
import { invalidateWorkspaceQueries } from "renderer/react-query/workspaces/invalidateWorkspaceQueries";
import { useActiveDragItemStore } from "renderer/stores/active-drag-item";
import { useWorkspaceSelectionStore } from "renderer/stores/workspace-selection";
import { SECTION_DND_TYPE } from "../constants";
import type { DragItem, SectionDragItem } from "../types";
import { reorderProjectChildrenInCache } from "../utils/reorderProjectChildrenInCache";
import { WORKSPACE_DND_TYPE } from "./constants";

interface UseWorkspaceDnDOptions {
	id: string;
	projectId: string;
	sectionId: string | null;
	index: number;
}

function getTargetIndexFromPointer(
	node: HTMLElement | null,
	index: number,
	monitor: { getClientOffset: () => { x: number; y: number } | null },
): number {
	if (!node) return index;

	const clientOffset = monitor.getClientOffset();
	if (!clientOffset) return index;

	const hoverBoundingRect = node.getBoundingClientRect();
	const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
	const hoverClientY = clientOffset.y - hoverBoundingRect.top;

	return hoverClientY < hoverMiddleY ? index : index + 1;
}

export function useWorkspaceDnD({
	id,
	projectId,
	sectionId,
	index,
}: UseWorkspaceDnDOptions) {
	const utils = electronTrpc.useUtils();
	const reorderProjectChildren = useReorderProjectChildren();
	const reorderWorkspacesInSection = useReorderWorkspacesInSection();
	const moveToSectionAtIndex = useMoveWorkspaceToSectionAtIndex();
	const bulkMoveToSection = useMoveWorkspacesToSection();
	const selectionStore = useWorkspaceSelectionStore;
	const dropRef = useRef<HTMLElement | null>(null);

	const handleReorder = useCallback(
		(item: DragItem) => {
			if (item.originalIndex === item.index) return;
			const callbacks = {
				onError: (error: { message: string }) => {
					void invalidateWorkspaceQueries(utils);
					toast.error(`Failed to reorder workspace: ${error.message}`);
				},
				onSettled: () => invalidateWorkspaceQueries(utils),
			};
			if (item.sectionId !== null) {
				reorderWorkspacesInSection.mutate(
					{
						sectionId: item.sectionId,
						fromIndex: item.originalIndex,
						toIndex: item.index,
					},
					callbacks,
				);
			} else {
				reorderProjectChildren.mutate(
					{
						projectId: item.projectId,
						fromIndex: item.originalIndex,
						toIndex: item.index,
					},
					callbacks,
				);
			}
		},
		[reorderProjectChildren, reorderWorkspacesInSection, utils],
	);

	const [{ isDragging }, drag] = useDrag(
		() => ({
			type: WORKSPACE_DND_TYPE,
			item: () => {
				const selection = selectionStore.getState();
				const isPartOfSelection = selection.selectedIds.has(id);
				if (!isPartOfSelection) {
					selection.clearSelection();
				}
				const selectedIds =
					isPartOfSelection && selection.selectedIds.size > 1
						? [...selection.selectedIds]
						: undefined;
				const dragItem: DragItem = {
					kind: "workspace",
					id,
					projectId,
					sectionId,
					index,
					originalIndex: index,
					selectedIds,
				};
				useActiveDragItemStore.getState().setActiveDragItem(dragItem);
				return dragItem;
			},
			end: (item, monitor) => {
				useActiveDragItemStore.getState().clearActiveDragItem();
				selectionStore.getState().clearSelection();
				if (!item) return;
				if (item.handled || monitor.didDrop()) return;
				handleReorder(item);
			},
			collect: (monitor) => ({ isDragging: monitor.isDragging() }),
		}),
		[id, projectId, sectionId, index, handleReorder],
	);

	const [, drop] = useDrop({
		accept:
			sectionId === null
				? [WORKSPACE_DND_TYPE, SECTION_DND_TYPE]
				: WORKSPACE_DND_TYPE,
		hover: (item: DragItem | SectionDragItem) => {
			if (item.kind === "section") {
				if (
					sectionId !== null ||
					item.projectId !== projectId ||
					item.index === index
				) {
					return;
				}
				utils.workspaces.getAllGrouped.setData(undefined, (oldData) =>
					reorderProjectChildrenInCache(oldData, projectId, item.index, index),
				);
				item.index = index;
				return;
			}
			if (item.selectedIds && item.selectedIds.length > 1) return;
			if (
				item.projectId !== projectId ||
				item.sectionId !== sectionId ||
				item.index === index
			)
				return;
			if (sectionId === null) {
				utils.workspaces.getAllGrouped.setData(undefined, (oldData) =>
					reorderProjectChildrenInCache(oldData, projectId, item.index, index),
				);
			} else {
				utils.workspaces.getAllGrouped.setData(undefined, (oldData) => {
					if (!oldData) return oldData;
					return oldData.map((group) => {
						if (group.project.id !== projectId) return group;
						const sections = group.sections.map((section) => {
							if (section.id !== sectionId) return section;
							const workspaces = [...section.workspaces];
							const [moved] = workspaces.splice(item.index, 1);
							workspaces.splice(index, 0, moved);
							return { ...section, workspaces };
						});
						return { ...group, sections };
					});
				});
			}
			item.index = index;
		},
		drop: (item: DragItem | SectionDragItem, monitor) => {
			if (item.kind === "section") {
				if (sectionId !== null || item.projectId !== projectId) return;
				reorderProjectChildren.mutate(
					{
						projectId,
						fromIndex: item.originalIndex,
						toIndex: item.index,
					},
					{
						onError: (error: { message: string }) => {
							void invalidateWorkspaceQueries(utils);
							toast.error(`Failed to reorder project items: ${error.message}`);
						},
					},
				);
				if (item.originalIndex !== item.index) return { reordered: true };
				return;
			}
			if (item.projectId !== projectId) return;
			if (item.sectionId === sectionId) {
				handleReorder(item);
				if (item.originalIndex !== item.index) return { reordered: true };
			} else if (!item.handled) {
				if (item.selectedIds && item.selectedIds.length > 1) {
					bulkMoveToSection.mutate({
						workspaceIds: item.selectedIds,
						sectionId,
					});
				} else {
					moveToSectionAtIndex.mutate({
						workspaceId: item.id,
						sectionId,
						targetIndex: getTargetIndexFromPointer(
							dropRef.current,
							index,
							monitor,
						),
					});
				}
				item.handled = true;
				return { moved: true };
			}
		},
	});

	const setNodeRef = useCallback(
		(node: HTMLElement | null) => {
			dropRef.current = node;
			drag(drop(node));
		},
		[drag, drop],
	);

	return { isDragging, setNodeRef };
}
