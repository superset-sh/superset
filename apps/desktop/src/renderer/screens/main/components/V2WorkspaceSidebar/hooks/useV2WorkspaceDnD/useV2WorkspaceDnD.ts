import { useCallback } from "react";
import { useDrag, useDrop } from "react-dnd";
import { useV2WorkspaceLocalMetaStore } from "renderer/stores/v2-workspace-local-meta";

const V2_WORKSPACE_DND_TYPE = "V2_WORKSPACE";

interface DragItem {
	workspaceId: string;
	projectId: string;
	index: number;
	originalIndex: number;
}

interface UseV2WorkspaceDnDOptions {
	workspaceId: string;
	projectId: string;
	index: number;
	workspaceIds: string[];
}

export function useV2WorkspaceDnD({
	workspaceId,
	projectId,
	index,
	workspaceIds,
}: UseV2WorkspaceDnDOptions) {
	const setWorkspaceTabOrder = useV2WorkspaceLocalMetaStore(
		(s) => s.setWorkspaceTabOrder,
	);
	const bumpSortVersion = useV2WorkspaceLocalMetaStore(
		(s) => s.bumpSortVersion,
	);

	const commitOrder = useCallback(
		(orderedIds: string[]) => {
			for (let i = 0; i < orderedIds.length; i++) {
				setWorkspaceTabOrder(orderedIds[i], i + 1);
			}
			bumpSortVersion();
		},
		[setWorkspaceTabOrder, bumpSortVersion],
	);

	const [{ isDragging }, drag] = useDrag(
		() => ({
			type: V2_WORKSPACE_DND_TYPE,
			item: (): DragItem => ({
				workspaceId,
				projectId,
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
		[workspaceId, projectId, index, workspaceIds, commitOrder],
	);

	const [, drop] = useDrop(
		{
			accept: V2_WORKSPACE_DND_TYPE,
			hover: (item: DragItem) => {
				if (item.projectId !== projectId || item.index === index) return;
				item.index = index;
			},
		},
		[projectId, index],
	);

	return { isDragging, drag, drop };
}
