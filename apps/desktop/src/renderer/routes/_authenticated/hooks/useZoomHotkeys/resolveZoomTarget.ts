export type ZoomTarget =
	| { kind: "terminal" }
	| { kind: "browser"; paneId: string }
	| { kind: "app" };

/**
 * What a zoom shortcut acts on, from keyboard focus: xterm's hidden textarea
 * means a terminal, a `<webview>` means that browser pane's page (a guest
 * keystroke is forwarded with the webview still focused), anything else the
 * whole app.
 */
export function resolveZoomTarget(
	active: Element | null,
	findBrowserPaneId: (element: Element) => string | null,
): ZoomTarget {
	if (!active) return { kind: "app" };
	if (active.classList.contains("xterm-helper-textarea")) {
		return { kind: "terminal" };
	}
	const paneId = findBrowserPaneId(active);
	return paneId ? { kind: "browser", paneId } : { kind: "app" };
}
