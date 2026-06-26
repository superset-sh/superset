/**
 * Marker attribute placed on the root of every embedded browser pane. The
 * global mouseup listener used by `NavigationControls` checks for this
 * attribute and skips app-level back/forward navigation so that mouse buttons
 * 4/5 routed up from a focused webview act on the embedded browser history
 * instead.
 */
export const BROWSER_PANE_ATTR = "data-browser-pane";

const BROWSER_PANE_SELECTOR = `[${BROWSER_PANE_ATTR}]`;

interface MouseUpLike {
	target: EventTarget | null;
}

export function shouldHandleNavigationMouseUp(event: MouseUpLike): boolean {
	const target = event.target;
	if (!target || typeof (target as Element).closest !== "function") return true;
	return (target as Element).closest(BROWSER_PANE_SELECTOR) === null;
}
