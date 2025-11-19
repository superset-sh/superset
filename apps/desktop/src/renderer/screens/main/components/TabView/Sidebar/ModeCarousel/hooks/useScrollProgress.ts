import { type MotionValue, useMotionValue } from "framer-motion";
import { useEffect } from "react";

interface UseScrollProgressOptions {
	scrollContainer: HTMLDivElement | null;
	currentIndex: number;
	onScrollProgress?: (progress: MotionValue<number>) => void;
}

export function useScrollProgress({
	scrollContainer,
	currentIndex,
	onScrollProgress,
}: UseScrollProgressOptions) {
	const initialProgress = currentIndex >= 0 ? currentIndex : 0;
	const modeProgress = useMotionValue(initialProgress);

	// Track scroll position and update motion value
	useEffect(() => {
		if (!scrollContainer) return;

		let rafId: number | undefined;

		const updateProgress = () => {
			const scrollLeft = scrollContainer.scrollLeft;
			const containerWidth = scrollContainer.offsetWidth;
			const progress = scrollLeft / containerWidth;
			modeProgress.set(progress);
		};

		const handleScroll = () => {
			// Use requestAnimationFrame for smooth updates
			if (rafId !== undefined) {
				cancelAnimationFrame(rafId);
			}
			rafId = requestAnimationFrame(updateProgress);
		};

		scrollContainer.addEventListener("scroll", handleScroll, { passive: true });

		// Initial value
		updateProgress();

		return () => {
			scrollContainer.removeEventListener("scroll", handleScroll);
			if (rafId !== undefined) {
				cancelAnimationFrame(rafId);
			}
		};
	}, [scrollContainer, modeProgress]);

	// Expose scroll progress to parent
	useEffect(() => {
		if (onScrollProgress) {
			onScrollProgress(modeProgress);
		}
	}, [onScrollProgress, modeProgress]);

	return modeProgress;
}
