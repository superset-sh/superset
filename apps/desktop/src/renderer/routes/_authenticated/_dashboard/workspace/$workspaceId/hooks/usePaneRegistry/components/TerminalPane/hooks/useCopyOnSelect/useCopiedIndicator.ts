import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { copiedIndicatorStore } from "./copiedIndicatorStore";

/** How long the "Copied" pill stays up after the last copy. */
const VISIBLE_MS = 1200;

/**
 * True while this pane copied something recently. Dragging a selection copies
 * many times in a row, so each copy restarts the timer rather than stacking
 * its own, and the pill stays up continuously instead of flickering.
 */
export function useCopiedIndicator(terminalInstanceId: string): boolean {
	const subscribe = useCallback(
		(listener: () => void) =>
			copiedIndicatorStore.subscribe(terminalInstanceId, listener),
		[terminalInstanceId],
	);
	const count = useSyncExternalStore(subscribe, () =>
		copiedIndicatorStore.getCount(terminalInstanceId),
	);

	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		if (count === 0) return;
		setIsVisible(true);
		const timeout = setTimeout(() => setIsVisible(false), VISIBLE_MS);
		return () => clearTimeout(timeout);
	}, [count]);

	return isVisible;
}
