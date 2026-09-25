import { createDragDropManager } from "dnd-core";
import type { MouseEvent } from "react";
import { HTML5Backend } from "react-dnd-html5-backend";

// Single, shared DragDropManager for the entire renderer
export const dragDropManager = createDragDropManager(HTML5Backend);

/**
 * Chromium resolves a mouse drag to the nearest `draggable` ancestor, so a
 * drag-to-select gesture inside a text input nested in a drag handle (e.g. a
 * pane header) moves the pane instead of selecting text. Attach to the input's
 * onMouseDown to suspend the ancestor's draggable for the gesture; it is
 * restored on mouseup.
 */
export function suspendAncestorDragForTextSelection(
	event: MouseEvent<HTMLElement>,
) {
	const dragSource =
		event.currentTarget.closest<HTMLElement>('[draggable="true"]');
	if (!dragSource) return;
	dragSource.draggable = false;
	window.addEventListener(
		"mouseup",
		() => {
			dragSource.draggable = true;
		},
		{ once: true },
	);
}
