import { useCallback, useEffect, useRef } from "react";
import { useDrop } from "react-dnd";
import {
	useMoveWorkspacesToSection,
	useMoveWorkspaceToSection,
} from "renderer/react-query/workspaces";
import type { DragItem } from "../types";
import { WORKSPACE_DND_TYPE } from "../WorkspaceListItem/constants";

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
	const autoExpandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const moveToSection = useMoveWorkspaceToSection();
	const bulkMoveToSection = useMoveWorkspacesToSection();

	const [{ isOver, canDrop }, dropRef] = useDrop<
		DragItem,
		{ moved: true } | undefined,
		{ isOver: boolean; canDrop: boolean }
	>(
		() => ({
			accept: WORKSPACE_DND_TYPE,
			canDrop: (item) => canAccept(item),
			hover: (_item, monitor) => {
				if (!onAutoExpand || autoExpandTimer.current) return;
				if (!monitor.canDrop() || !monitor.isOver()) return;
				autoExpandTimer.current = setTimeout(() => {
					onAutoExpand();
					autoExpandTimer.current = null;
				}, 600);
			},
			drop: (item, monitor) => {
				if (monitor.didDrop() || !monitor.canDrop()) return;
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
				return { moved: true };
			},
			collect: (monitor) => ({
				isOver: monitor.isOver(),
				canDrop: monitor.canDrop(),
			}),
		}),
		[
			canAccept,
			targetSectionId,
			targetRootPlacement,
			onAutoExpand,
			moveToSection,
			bulkMoveToSection,
		],
	);
	const isDropTarget = canDrop;
	const isDragOver = canDrop && isOver;
	const attachDropRef = useCallback(
		(node: HTMLElement | null) => {
			dropRef(node);
		},
		[dropRef],
	);

	useEffect(() => {
		if (isDragOver) return;
		if (autoExpandTimer.current) {
			clearTimeout(autoExpandTimer.current);
			autoExpandTimer.current = null;
		}
	}, [isDragOver]);

	useEffect(() => {
		return () => {
			if (autoExpandTimer.current) clearTimeout(autoExpandTimer.current);
		};
	}, []);

	return {
		isDragOver,
		isDropTarget,
		attachDropRef,
	};
}
