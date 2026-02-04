import { useCallback } from "react";

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
			e.dataTransfer.effectAllowed = "copy";
		},
		[absolutePath],
	);

	return {
		draggable: Boolean(absolutePath),
		onDragStart: handleDragStart,
	};
}
