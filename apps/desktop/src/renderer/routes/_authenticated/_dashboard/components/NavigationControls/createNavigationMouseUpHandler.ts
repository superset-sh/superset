import { shouldHandleNavigationMouseUp } from "./shouldHandleNavigationMouseUp";

interface NavigationMouseUpEvent {
	target: EventTarget | null;
	button: number;
	preventDefault: () => void;
}

interface CreateNavigationMouseUpHandlerOptions {
	onBack: () => void;
	onForward: () => void;
}

/**
 * Builds the global mouseup handler that maps mouse buttons 4/5 (event.button
 * 3/4) to app history back/forward. Events that originated inside an embedded
 * browser pane are skipped so the focused webview can act on its own history
 * instead — see issue #4515.
 */
export function createNavigationMouseUpHandler({
	onBack,
	onForward,
}: CreateNavigationMouseUpHandlerOptions): (
	event: NavigationMouseUpEvent,
) => void {
	return (event) => {
		if (!shouldHandleNavigationMouseUp(event)) return;
		if (event.button === 3) {
			event.preventDefault();
			onBack();
		} else if (event.button === 4) {
			event.preventDefault();
			onForward();
		}
	};
}
