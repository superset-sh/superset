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
			event.preventDefault();
			const action = pending.current;
			pending.current = null;
			action?.();
		},
	};
}
