import type { DragEvent, PointerEvent } from "react";
import { useCallback, useRef } from "react";
import { resolveRowDragPath } from "./useFilesTabDragSource.utils";

const FILE_PATH_MIME = "application/x-superset-file-path";

interface UseFilesTabDragSourceOptions {
	rootPath: string;
}

interface UseFilesTabDragSourceResult {
	onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => void;
	onPointerUpCapture: (event: PointerEvent<HTMLDivElement>) => void;
	onPointerCancelCapture: (event: PointerEvent<HTMLDivElement>) => void;
	onDragStart: (event: DragEvent<HTMLDivElement>) => void;
	onDragEnd: (event: DragEvent<HTMLDivElement>) => void;
}

function findRowInComposedPath(event: Event): HTMLElement | null {
	for (const node of event.composedPath()) {
		if (node instanceof HTMLElement && node.getAttribute("data-item-path")) {
			return node;
		}
	}
	return null;
}

export function useFilesTabDragSource({
	rootPath,
}: UseFilesTabDragSourceOptions): UseFilesTabDragSourceResult {
	const stampedRowRef = useRef<HTMLElement | null>(null);

	const clearStampedRow = useCallback(() => {
		stampedRowRef.current?.removeAttribute("draggable");
		stampedRowRef.current = null;
	}, []);

	const onPointerDownCapture = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			clearStampedRow();
			if (event.button !== 0) return;

			const innermost = event.nativeEvent.composedPath()[0];
			if (
				innermost instanceof HTMLElement &&
				innermost.closest("input, textarea, [contenteditable]")
			) {
				return;
			}

			const row = findRowInComposedPath(event.nativeEvent);
			if (!row) return;

			row.setAttribute("draggable", "true");
			stampedRowRef.current = row;
		},
		[clearStampedRow],
	);

	const onDragStart = useCallback(
		(event: DragEvent<HTMLDivElement>) => {
			const row = findRowInComposedPath(event.nativeEvent);
			const treePath = row?.getAttribute("data-item-path") ?? null;
			const absolutePath = resolveRowDragPath(treePath, rootPath);

			if (!absolutePath) {
				event.preventDefault();
				return;
			}

			event.dataTransfer.setData("text/plain", absolutePath);
			event.dataTransfer.setData(FILE_PATH_MIME, absolutePath);
			event.dataTransfer.effectAllowed = "copy";
		},
		[rootPath],
	);

	return {
		onPointerDownCapture,
		onPointerUpCapture: clearStampedRow,
		onPointerCancelCapture: clearStampedRow,
		onDragStart,
		onDragEnd: clearStampedRow,
	};
}
