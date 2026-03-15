import { useCallback } from "react";
import { useDrag, useDrop } from "react-dnd";
import { useV2ProjectLocalMetaStore } from "renderer/stores/v2-project-local-meta";

const V2_PROJECT_DND_TYPE = "V2_PROJECT";

interface DragItem {
	projectId: string;
	index: number;
	originalIndex: number;
}

interface UseV2ProjectDnDOptions {
	projectId: string;
	index: number;
	projectIds: string[];
}

export function useV2ProjectDnD({
	projectId,
	index,
	projectIds,
}: UseV2ProjectDnDOptions) {
	const setProjectTabOrder = useV2ProjectLocalMetaStore(
		(s) => s.setProjectTabOrder,
	);

	const commitOrder = useCallback(
		(orderedIds: string[]) => {
			for (let i = 0; i < orderedIds.length; i++) {
				setProjectTabOrder(orderedIds[i], i + 1);
			}
		},
		[setProjectTabOrder],
	);

	const [{ isDragging }, drag] = useDrag(
		() => ({
			type: V2_PROJECT_DND_TYPE,
			item: (): DragItem => ({
				projectId,
				index,
				originalIndex: index,
			}),
			collect: (monitor) => ({
				isDragging: monitor.isDragging(),
			}),
			end: (item) => {
				if (!item || item.originalIndex === item.index) return;
				const ids = [...projectIds];
				const [moved] = ids.splice(item.originalIndex, 1);
				ids.splice(item.index, 0, moved);
				commitOrder(ids);
			},
		}),
		[projectId, index, projectIds, commitOrder],
	);

	const [, drop] = useDrop(
		{
			accept: V2_PROJECT_DND_TYPE,
			hover: (item: DragItem) => {
				if (item.index === index) return;
				item.index = index;
			},
		},
		[index],
	);

	return { isDragging, drag, drop };
}
