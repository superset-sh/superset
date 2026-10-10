import { useCallback } from "react";
import { setFileDragData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceSidebar/utils/setFileDragData";

/** Drag props for a regular-DOM changes row (folders view). */
export function useFileDrag({ absolutePath }: { absolutePath?: string }) {
	const onDragStart = useCallback(
		(e: React.DragEvent) => {
			if (!absolutePath) {
				e.preventDefault();
				return;
			}
			setFileDragData(e.dataTransfer, absolutePath);
		},
		[absolutePath],
	);

	return { draggable: Boolean(absolutePath), onDragStart };
}
