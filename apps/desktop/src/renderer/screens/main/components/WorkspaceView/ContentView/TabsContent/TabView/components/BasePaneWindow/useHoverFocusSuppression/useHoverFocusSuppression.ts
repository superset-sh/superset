import { useCallback, useEffect, useRef } from "react";
import { useDragPaneStore } from "renderer/stores/drag-pane-store";
import { computeHoverFocusSuppression } from "./computeHoverFocusSuppression";

const RADIX_OPEN_OVERLAY_SELECTOR =
	'[data-state="open"][role="menu"], ' +
	'[data-state="open"][role="dialog"], ' +
	'[data-state="open"][role="tooltip"], ' +
	'[data-radix-popper-content-wrapper] [data-state="open"]';

/**
 * Returns a stable callback that computes whether hover-focus should be
 * suppressed at the moment of invocation. Sources:
 *   - useDragPaneStore (read imperatively to avoid re-rendering on drag flips)
 *   - document.hasFocus()
 *   - document mousedown/mouseup listeners (for "mid-selection" detection)
 *   - querySelector for an open Radix overlay
 *
 * Known limitation: a click that opens a native OS dialog and is released
 * inside the native window won't deliver `mouseup` to our document. This
 * leaves `isPointerDownRef` stuck at `true`, suppressing hover-focus until
 * the user clicks back inside the app. Errs on the safe side.
 */
export function useHoverFocusSuppression(): () => boolean {
	const isPointerDownRef = useRef(false);

	useEffect(() => {
		const onDown = (e: MouseEvent) => {
			if (e.button === 0) isPointerDownRef.current = true;
		};
		const onUp = (e: MouseEvent) => {
			if (e.button === 0) isPointerDownRef.current = false;
		};
		document.addEventListener("mousedown", onDown);
		document.addEventListener("mouseup", onUp);
		return () => {
			document.removeEventListener("mousedown", onDown);
			document.removeEventListener("mouseup", onUp);
		};
	}, []);

	return useCallback((): boolean => {
		const drag = useDragPaneStore.getState();
		return computeHoverFocusSuppression({
			isPointerDown: isPointerDownRef.current,
			isPaneDragging: drag.draggingPaneId !== null,
			isResizing: drag.isResizing,
			hasWindowFocus: document.hasFocus(),
			hasOpenOverlay: !!document.querySelector(RADIX_OPEN_OVERLAY_SELECTOR),
		});
	}, []);
}
