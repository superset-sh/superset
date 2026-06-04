import { useCallback, useEffect, useRef, useState } from "react";
import {
	useMoveWorkspacesToSection,
	useMoveWorkspaceToSection,
} from "renderer/react-query/workspaces";
import {
	getActiveDragItem,
	useActiveDragItemStore,
} from "renderer/stores/active-drag-item";
import type { DragItem } from "../types";

interface UseSectionDropZoneOptions {
	canAccept: (item: DragItem) => boolean;
	targetSectionId: string | null;
	targetRootPlacement?: "top" | "bottom";
	onAutoExpand?: () => void;
}

export function useSectionDropZone({
	canAccept,
	targetSectionId,
	targetRootPlacement,
	onAutoExpand,
}: UseSectionDropZoneOptions) {
	const [isDragOver, setIsDragOver] = useState(false);
	const isDropTarget = useActiveDragItemStore(
		(state) => state.activeDragItem !== null && canAccept(state.activeDragItem),
	);
	const dragEnterCount = useRef(0);
	const autoExpandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const moveToSection = useMoveWorkspaceToSection();
	const bulkMoveToSection = useMoveWorkspacesToSection();

	useEffect(() => {
		return () => {
			if (autoExpandTimer.current) clearTimeout(autoExpandTimer.current);
		};
	}, []);

	const handleDragOver = useCallback(
		(e: React.DragEvent) => {
			const item = getActiveDragItem();
			if (item && canAccept(item)) {
				e.preventDefault();
			}
		},
		[canAccept],
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			const item = getActiveDragItem();
			if (!item || !canAccept(item)) return;
			e.preventDefault();
			if (autoExpandTimer.current) {
				clearTimeout(autoExpandTimer.current);
				autoExpandTimer.current = null;
			}
			if (item.selectedIds && item.selectedIds.length > 1) {
				bulkMoveToSection.mutate({
					workspaceIds: item.selectedIds,
					sectionId: targetSectionId,
					...(targetSectionId === null && targetRootPlacement
						? { rootPlacement: targetRootPlacement }
						: {}),
				});
			} else {
				moveToSection.mutate({
					workspaceId: item.id,
					sectionId: targetSectionId,
					...(targetSectionId === null && targetRootPlacement
						? { rootPlacement: targetRootPlacement }
						: {}),
				});
			}
			item.handled = true;
			dragEnterCount.current = 0;
			setIsDragOver(false);
		},
		[
			canAccept,
			targetSectionId,
			targetRootPlacement,
			moveToSection,
			bulkMoveToSection,
		],
	);

	const handleDragEnter = useCallback(
		(e: React.DragEvent) => {
			const item = getActiveDragItem();
			if (!item || !canAccept(item)) return;
			e.preventDefault();
			dragEnterCount.current++;
			setIsDragOver(true);
			if (onAutoExpand && !autoExpandTimer.current) {
				autoExpandTimer.current = setTimeout(() => {
					onAutoExpand();
					autoExpandTimer.current = null;
				}, 600);
			}
		},
		[canAccept, onAutoExpand],
	);

	const handleDragLeave = useCallback(() => {
		dragEnterCount.current--;
		if (dragEnterCount.current <= 0) {
			dragEnterCount.current = 0;
			setIsDragOver(false);
			if (autoExpandTimer.current) {
				clearTimeout(autoExpandTimer.current);
				autoExpandTimer.current = null;
			}
		}
	}, []);

	const handleDragEnd = useCallback(() => {
		dragEnterCount.current = 0;
		setIsDragOver(false);
		if (autoExpandTimer.current) {
			clearTimeout(autoExpandTimer.current);
			autoExpandTimer.current = null;
		}
	}, []);

	return {
		isDragOver,
		isDropTarget,
		handlers: {
			onDragOver: handleDragOver,
			onDrop: handleDrop,
			onDragEnter: handleDragEnter,
			onDragLeave: handleDragLeave,
			onDragEnd: handleDragEnd,
		},
	};
}
