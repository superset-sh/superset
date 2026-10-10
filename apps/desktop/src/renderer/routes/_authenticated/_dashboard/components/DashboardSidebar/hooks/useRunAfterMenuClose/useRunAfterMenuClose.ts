import { useRef } from "react";

/**
 * A menu keeps focus trapped until its exit animation ends, so an action that
 * moves focus (starting a rename) has to wait for the menu to finish closing.
 */
export function useRunAfterMenuClose() {
	const pending = useRef<(() => void) | null>(null);
	return {
		runAfterClose: (action: () => void) => {
			pending.current = action;
		},
		onCloseAutoFocus: (event: Event) => {
			const action = pending.current;
			// Nothing to run: this is a plain dismissal (Escape, click away),
			// so let Radix restore focus to the trigger as it normally does.
			// Suppressing it here would drop the keyboard user's focus with the
			// menu item that just disappeared.
			if (!action) {
				return;
			}
			// A pending action moves focus itself (starting a rename), and the
			// menu keeps focus trapped until its exit animation ends, so the
			// menu's own focus restoration has to be suppressed until then.
			event.preventDefault();
			pending.current = null;
			action();
		},
	};
}
