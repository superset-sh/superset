import { useRef, useState } from "react";
import { useModeDetection } from "./hooks/useModeDetection";
import { useScrollProgress } from "./hooks/useScrollProgress";
import { useScrollSnap } from "./hooks/useScrollSnap";
import { ModeContent } from "./ModeContent";
import { ModeHeader } from "./ModeHeader";
import { ModeNavigation } from "./ModeNavigation";
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
	const currentIndex = modes.indexOf(currentMode);
	const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(
		null,
	);

	const scrollContainerRef = (node: HTMLDivElement | null) => {
		if (node) {
			setScrollContainer(node);
		}
	};

	const modeProgress = useScrollProgress({
		scrollContainer,
		currentIndex,
		onScrollProgress,
	});

	useScrollSnap({
		scrollContainer,
		currentIndex,
		isInitialMount,
	});

	useModeDetection({
		scrollContainer,
		modes,
		currentMode,
		onModeSelect,
		isDragging,
	});

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
				className="flex-1 overflow-x-scroll overflow-y-hidden"
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
