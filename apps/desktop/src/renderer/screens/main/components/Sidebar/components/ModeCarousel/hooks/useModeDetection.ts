import { useEffect } from "react";
import type { SidebarMode } from "../types";

interface UseModeDetectionOptions {
	scrollContainer: HTMLDivElement | null;
	modes: SidebarMode[];
	currentMode: SidebarMode;
	onModeSelect: (mode: SidebarMode) => void;
	isDragging?: boolean;
}

export function useModeDetection({
	scrollContainer,
	modes,
	currentMode,
	onModeSelect,
	isDragging = false,
}: UseModeDetectionOptions) {
	// Detect when user finishes scrolling and update current mode
	useEffect(() => {
		if (!scrollContainer || isDragging) return;

		let scrollEndTimer: NodeJS.Timeout | undefined;

		const handleScroll = () => {
			// Clear existing timeout
			if (scrollEndTimer) {
				clearTimeout(scrollEndTimer);
			}

			// Wait for scroll to settle before updating mode (reduces jitter)
			scrollEndTimer = setTimeout(() => {
				const finalScrollLeft = scrollContainer.scrollLeft;
				const finalContainerWidth = scrollContainer.offsetWidth;

				// Calculate which mode we're closest to and snap to it
				const finalIndex = Math.round(finalScrollLeft / finalContainerWidth);

				if (finalIndex >= 0 && finalIndex < modes.length && modes[finalIndex]) {
					// Snap to the nearest mode
					const targetScrollX = finalIndex * finalContainerWidth;
					if (Math.abs(finalScrollLeft - targetScrollX) > 5) {
						scrollContainer.scrollTo({
							left: targetScrollX,
							behavior: "smooth",
						});
					}

					// Update mode if it changed
					if (modes[finalIndex] !== currentMode) {
						onModeSelect(modes[finalIndex]);
					}
				}
			}, 150);
		};

		scrollContainer.addEventListener("scroll", handleScroll, { passive: true });

		return () => {
			scrollContainer.removeEventListener("scroll", handleScroll);
			if (scrollEndTimer) {
				clearTimeout(scrollEndTimer);
			}
		};
	}, [modes, currentMode, onModeSelect, scrollContainer, isDragging]);
}
