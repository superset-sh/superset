import { useNavigation } from "expo-router";
import { useCallback } from "react";

// native-stack emits transitionEnd on the screen this navigation belongs to;
// the event isn't in expo-router's base event map, hence the local shape.
interface TransitionEndEvents {
	addListener: (type: "transitionEnd", callback: () => void) => () => void;
}

/**
 * Returns a stable function that runs `action` once the screen's next
 * transition animation finishes — the earliest point a second modal
 * presentation or a keyboard request succeeds. The returned unsubscribe
 * cancels a still-pending action.
 */
export function useAfterTransitionEnd(): (action: () => void) => () => void {
	const navigation = useNavigation() as unknown as TransitionEndEvents;
	return useCallback(
		(action: () => void) => {
			const unsubscribe = navigation.addListener("transitionEnd", () => {
				unsubscribe();
				action();
			});
			return unsubscribe;
		},
		[navigation],
	);
}
