import { useCallback } from "react";

const FILE_PATH_MIME = "application/x-superset-file-path";

interface UseFileDragProps {
	absolutePath: string | null;
}

export function useFileDrag({ absolutePath }: UseFileDragProps) {
	const handleDragStart = useCallback(
		(e: React.DragEvent) => {
			if (!absolutePath) {
				e.preventDefault();
				return;
			}
			e.dataTransfer.setData("text/plain", absolutePath);
			e.dataTransfer.setData(FILE_PATH_MIME, absolutePath);
			e.dataTransfer.effectAllowed = "copy";
		},
		[absolutePath],
	);

	return {
		draggable: Boolean(absolutePath),
		onDragStart: handleDragStart,
	};
}
