import { useCallback } from "react";
import { useDrag, useDrop } from "react-dnd";
import { useV2SidebarState } from "renderer/lib/v2-sidebar-state";

const V2_WORKSPACE_DND_TYPE = "V2_WORKSPACE";

interface DragItem {
	workspaceId: string;
	projectId: string;
	sectionId: string | null;
	index: number;
	originalIndex: number;
}

interface UseV2WorkspaceDnDOptions {
	workspaceId: string;
	projectId: string;
	sectionId: string | null;
	index: number;
	workspaceIds: string[];
}

export function useV2WorkspaceDnD({
	workspaceId,
	projectId,
	sectionId,
	index,
	workspaceIds,
}: UseV2WorkspaceDnDOptions) {
	const { reorderWorkspaces } = useV2SidebarState();

	const commitOrder = useCallback(
		(orderedIds: string[]) => {
			reorderWorkspaces(orderedIds);
		},
		[reorderWorkspaces],
	);

	const [{ isDragging }, drag] = useDrag(
		() => ({
			type: V2_WORKSPACE_DND_TYPE,
			item: (): DragItem => ({
				workspaceId,
				projectId,
				sectionId,
				index,
				originalIndex: index,
			}),
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
			}),
			end: (item) => {
				if (!item || item.originalIndex === item.index) return;
				const ids = [...workspaceIds];
				const [moved] = ids.splice(item.originalIndex, 1);
				ids.splice(item.index, 0, moved);
				commitOrder(ids);
			},
		}),
		[workspaceId, projectId, sectionId, index, workspaceIds, commitOrder],
	);

	const [, drop] = useDrop(
		{
			accept: V2_WORKSPACE_DND_TYPE,
			hover: (item: DragItem) => {
				if (
					item.projectId !== projectId ||
					item.sectionId !== sectionId ||
					item.index === index
				) {
					return;
				}
				item.index = index;
			},
		},
		[projectId, sectionId, index],
	);

	return { isDragging, drag, drop };
}
