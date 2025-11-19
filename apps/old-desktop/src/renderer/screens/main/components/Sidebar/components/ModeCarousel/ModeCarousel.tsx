import { useCallback, useRef, useState } from "react";
import { ModeContent } from "./components/ModeContent";
import { ModeHeader } from "./components/ModeHeader";
import { ModeNavigation } from "./components/ModeNavigation";
import { useModeDetection } from "./hooks/useModeDetection";
import { useScrollProgress } from "./hooks/useScrollProgress";
import { useScrollSnap } from "./hooks/useScrollSnap";
import type { ModeCarouselProps } from "./types";

export function ModeCarousel({
	modes,
	currentMode,
	onModeSelect,
	children,
	onScrollProgress,
	isDragging = false,
}: ModeCarouselProps) {
	const isInitialMount = useRef(true);
	const currentIndex = modes.findIndex((m) => m === currentMode);
	const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(
		null,
	);

	// Use callback ref to get notified when the ref is attached
	const scrollContainerRef = useCallback((node: HTMLDivElement | null) => {
		if (node) {
			setScrollContainer(node);
		}
	}, []);

	// Track scroll progress
	const modeProgress = useScrollProgress({
		scrollContainer,
		currentIndex,
		onScrollProgress,
	});

	// Handle scroll snapping
	useScrollSnap({
		scrollContainer,
		currentIndex,
		isInitialMount,
	});

	// Detect mode changes from scrolling
	useModeDetection({
		scrollContainer,
		modes,
		currentMode,
		onModeSelect,
		isDragging,
	});

	// If only one mode or no modes, disable carousel
	if (modes.length <= 1) {
		return (
			<div className="flex flex-col flex-1 h-full">
				<div className="flex-1 overflow-y-auto">
					<ModeHeader mode={currentMode} />
					<div className="px-3">{children(currentMode, true)}</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col flex-1 h-full">
			{/* Carousel content */}
			<div
				ref={scrollContainerRef}
				className="flex-1 overflow-x-scroll overflow-y-hidden hide-scrollbar"
				style={{
					scrollSnapType: isDragging ? "none" : "x mandatory",
					scrollSnapStop: "always",
					scrollBehavior: "smooth",
					WebkitOverflowScrolling: "touch",
					overscrollBehaviorX: "contain",
					scrollbarWidth: "none",
					msOverflowStyle: "none",
					pointerEvents: isDragging ? "none" : "auto",
				}}
			>
				<div
					className="flex h-full"
					style={{ width: `${modes.length * 100}%` }}
				>
					{modes.map((mode) => (
						<div
							key={mode}
							style={{
								width: `${100 / modes.length}%`,
							}}
						>
							<ModeContent mode={mode} isActive={mode === currentMode}>
								{children(mode, mode === currentMode)}
							</ModeContent>
						</div>
					))}
				</div>
			</div>

			{/* Bottom navigation bar */}
			<ModeNavigation
				modes={modes}
				currentMode={currentMode}
				onModeSelect={onModeSelect}
				scrollProgress={modeProgress}
			/>
		</div>
	);
}
