import { useEffect } from "react";

interface UseScrollSnapOptions {
	scrollContainer: HTMLDivElement | null;
	currentIndex: number;
	isInitialMount: React.MutableRefObject<boolean>;
}

export function useScrollSnap({
	scrollContainer,
	currentIndex,
	isInitialMount,
}: UseScrollSnapOptions) {
	// Scroll to current mode when it changes externally
	useEffect(() => {
		if (!scrollContainer || currentIndex < 0) return;

		const targetScrollX = currentIndex * scrollContainer.offsetWidth;

		// Only scroll if we're not already at the target position
		if (Math.abs(scrollContainer.scrollLeft - targetScrollX) > 5) {
			scrollContainer.scrollTo({
				left: targetScrollX,
				behavior: isInitialMount.current ? "auto" : "smooth",
			});
		}

		// Mark that initial mount is complete
		isInitialMount.current = false;
	}, [currentIndex, scrollContainer, isInitialMount]);
}
