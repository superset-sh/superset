import { arrayMove } from "@dnd-kit/sortable";
import type { ProjectCollectionCommand } from "renderer/routes/_authenticated/hooks/useProjectCollections";

export const PROJECT_COLLECTION_ROOT_DROP = "project-collection-root";
export const collectionDropId = (id: string) => `collection-drop:${id}`;

export interface ProjectCollectionDragLayout {
	rootKeys: string[];
	isRail?: boolean;
	railProjectIds?: string[];
	immovableProjectIds?: string[];
	collections: Array<{
		id: string;
		tag: string;
		name?: string;
		color?: string | null;
		isCollapsed?: boolean;
		projectIds: string[];
	}>;
}

export function planProjectCollectionDrop(
	layout: ProjectCollectionDragLayout,
	active: string,
	over: string,
): ProjectCollectionCommand | null {
	if (active === over) return null;
	if (layout.isRail) {
		const keys =
			layout.railProjectIds ??
			layout.rootKeys.flatMap(
				(key) =>
					layout.collections.find((row) => row.id === key)?.projectIds ?? [key],
			);
		const from = keys.indexOf(active);
		const to = keys.indexOf(over);
		if (from < 0 || to < 0) return null;
		const source = layout.collections.find((row) =>
			row.projectIds.includes(active),
		);
		if (source) {
			const targetIndex = source.projectIds.indexOf(over);
			const index =
				targetIndex >= 0
					? targetIndex
					: to < from
						? 0
						: source.projectIds.length - 1;
			const sourceIndex = source.projectIds.indexOf(active);
			return sourceIndex !== index
				? {
						type: "reorder",
						keys: arrayMove(source.projectIds, sourceIndex, index),
					}
				: null;
		}
		const target = layout.collections.find((row) =>
			row.projectIds.includes(over),
		);
		const sourceIndex = layout.rootKeys.indexOf(active);
		const targetIndex = layout.rootKeys.indexOf(target?.id ?? over);
		return sourceIndex >= 0 && targetIndex >= 0 && sourceIndex !== targetIndex
			? {
					type: "reorder",
					keys: arrayMove(layout.rootKeys, sourceIndex, targetIndex),
				}
			: null;
	}
	const source = layout.collections.find((row) =>
		row.projectIds.includes(active),
	);
	const draggedCollection = layout.collections.find((row) => row.id === active);
	const target = layout.collections.find(
		(row) => row.projectIds.includes(over) || collectionDropId(row.id) === over,
	);
	if (draggedCollection) {
		const targetKey = target?.id ?? over;
		const from = layout.rootKeys.indexOf(active);
		const to =
			targetKey === PROJECT_COLLECTION_ROOT_DROP
				? layout.rootKeys.length - 1
				: layout.rootKeys.indexOf(targetKey);
		return from >= 0 && to >= 0 && from !== to
			? { type: "reorder", keys: arrayMove(layout.rootKeys, from, to) }
			: null;
	}
	if (target) {
		const index = target.projectIds.indexOf(over);
		if (source?.id === target.id) {
			if (index < 0) return null;
			return {
				type: "reorder",
				keys: arrayMove(
					target.projectIds,
					target.projectIds.indexOf(active),
					index,
				),
			};
		}
		if (layout.immovableProjectIds?.includes(active)) return null;
		return {
			type: "move",
			projectIds: [active],
			tag: target.tag,
			index: index < 0 ? target.projectIds.length : index,
			beforeKey: index >= 0 ? over : null,
		};
	}
	const index =
		over === PROJECT_COLLECTION_ROOT_DROP
			? layout.rootKeys.length
			: layout.rootKeys.indexOf(over);
	if (index < 0) return null;
	if (source) {
		if (layout.immovableProjectIds?.includes(active)) return null;
		return {
			type: "move",
			projectIds: [active],
			tag: null,
			index,
			beforeKey: over !== PROJECT_COLLECTION_ROOT_DROP ? over : null,
		};
	}
	const from = layout.rootKeys.indexOf(active);
	const to = Math.min(index, layout.rootKeys.length - 1);
	return from >= 0 && from !== to
		? { type: "reorder", keys: arrayMove(layout.rootKeys, from, to) }
		: null;
}
