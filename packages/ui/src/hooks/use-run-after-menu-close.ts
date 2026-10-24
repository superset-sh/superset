import { useRef } from "react";

/**
 * A menu keeps focus trapped until its exit animation ends, so an action that
 * moves focus (starting a rename) has to wait for the menu to finish closing.
 * Native restoration without a queued action is opt-in: other callers may
 * already have focused an inline editor or opened a dialog.
 */
export function useRunAfterMenuClose({
	restoreFocusOnClose = false,
}: {
	restoreFocusOnClose?: boolean;
} = {}) {
	const pending = useRef<(() => void) | null>(null);
	return {
		runAfterClose: (action: () => void) => {
			pending.current = action;
		},
		onCloseAutoFocus: (event: Event) => {
			const action = pending.current;
			pending.current = null;
			if (!action && restoreFocusOnClose) return;
			event.preventDefault();
			action?.();
		},
	};
}
