import { Button } from "@superset/ui/button";
import { type MotionValue, motion, useMotionValue, useTransform } from "framer-motion";
import { GitBranch, LayoutList } from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

export type SidebarMode = "tabs" | "diff";

const modeIcons: Record<SidebarMode, typeof LayoutList> = {
	tabs: LayoutList,
	diff: GitBranch,
};

interface AnimatedBackgroundProps {
	progress: MotionValue<number>;
	modeCount: number;
}

function AnimatedBackground({ progress, modeCount }: AnimatedBackgroundProps) {
	// Calculate the width of each button (36px = h-9 w-9) + gap (4px = gap-1)
	const buttonWidth = 36;
	const gap = 4;
	const totalButtonWidth = buttonWidth + gap;

	// Transform progress (0-1) to translateX position
	// For 2 modes: 0 -> 0px, 1 -> 40px (buttonWidth + gap)
	const translateX = useTransform(
		progress,
		[0, modeCount - 1],
		[0, (modeCount - 1) * totalButtonWidth]
	);

	return (
		<motion.div
			className="absolute h-9 rounded-lg bg-neutral-800/60"
			style={{
				width: buttonWidth,
				x: translateX,
			}}
			initial={false}
			transition={{
				type: "spring",
				stiffness: 300,
				damping: 30,
			}}
		/>
	);
}

interface ModeCarouselProps {
	modes: SidebarMode[];
	currentMode: SidebarMode;
	onModeSelect: (mode: SidebarMode) => void;
	children: (mode: SidebarMode, isActive: boolean) => ReactNode;
	onScrollProgress: (progress: MotionValue<number>) => void;
	isDragging?: boolean;
}

export function ModeCarousel({
	modes,
	currentMode,
	onModeSelect,
	children,
	onScrollProgress,
	isDragging = false,
}: ModeCarouselProps) {
	const scrollTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
	const isInitialMount = useRef(true);

	const currentIndex = modes.findIndex((m) => m === currentMode);
	const initialProgress = currentIndex >= 0 ? currentIndex : 0;
	const modeProgress = useMotionValue(initialProgress);

	const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(
		null,
	);

	// Use callback ref to get notified when the ref is attached
	const scrollContainerRef = useCallback((node: HTMLDivElement | null) => {
		if (node) {
			setScrollContainer(node);
		}
	}, []);

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
		onScrollProgress(modeProgress);
	}, [onScrollProgress, modeProgress]);

	// Scroll to current mode when it changes externally
	useEffect(() => {
		if (!scrollContainer || currentIndex < 0) return;

		const targetScrollX = currentIndex * scrollContainer.offsetWidth;

		// Only scroll if we're not already at the target position
		if (Math.abs(scrollContainer.scrollLeft - targetScrollX) > 10) {
			scrollContainer.scrollTo({
				left: targetScrollX,
				behavior: isInitialMount.current ? "auto" : "smooth",
			});
		}

		// Mark that initial mount is complete
		isInitialMount.current = false;
	}, [currentIndex, scrollContainer]);

	// Detect when user finishes scrolling and update current mode
	useEffect(() => {
		if (!scrollContainer || isDragging) return;

		const handleScroll = () => {
			// Clear existing timeout
			if (scrollTimeoutRef.current) {
				clearTimeout(scrollTimeoutRef.current);
			}

			// Wait for scroll to settle (150ms after last scroll event)
			scrollTimeoutRef.current = setTimeout(() => {
				const scrollLeft = scrollContainer.scrollLeft;
				const containerWidth = scrollContainer.offsetWidth;

				// Calculate which mode we're closest to
				const newIndex = Math.round(scrollLeft / containerWidth);

				// Update mode if it changed
				if (
					newIndex >= 0 &&
					newIndex < modes.length &&
					modes[newIndex] &&
					modes[newIndex] !== currentMode
				) {
					onModeSelect(modes[newIndex]);
				}
			}, 150);
		};

		scrollContainer.addEventListener("scroll", handleScroll);

		return () => {
			scrollContainer.removeEventListener("scroll", handleScroll);
			if (scrollTimeoutRef.current) {
				clearTimeout(scrollTimeoutRef.current);
			}
		};
	}, [modes, currentMode, onModeSelect, scrollContainer, isDragging]);

	// If only one mode or no modes, disable carousel
	if (modes.length <= 1) {
		return (
			<div className="flex flex-col flex-1 h-full">
				<div className="flex-1 overflow-y-auto px-3">
					{children(currentMode, true)}
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
					WebkitOverflowScrolling: "touch",
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
							className="overflow-y-auto px-3"
							style={{
								scrollSnapAlign: "start",
								scrollSnapStop: "always",
								width: `${100 / modes.length}%`,
							}}
						>
							{children(mode, mode === currentMode)}
						</div>
					))}
				</div>
			</div>

			{/* Bottom navigation bar - Arc browser style */}
			<div className="flex items-center justify-center gap-1 px-2 py-2 border-t border-neutral-800/50 bg-neutral-900/50 backdrop-blur-sm">
				<div className="relative flex items-center gap-1">
					{/* Animated background indicator */}
					<AnimatedBackground progress={modeProgress} modeCount={modes.length} />

					{modes.map((mode) => {
						const Icon = modeIcons[mode];
						const isActive = mode === currentMode;

						return (
							<Button
								key={mode}
								variant="ghost"
								size="sm"
								onClick={() => onModeSelect(mode)}
								className={`relative z-10 h-9 w-9 rounded-lg transition-colors duration-200 ${isActive
									? "text-neutral-100"
									: "text-neutral-400 hover:text-neutral-300"
									}`}
							>
								<Icon className="w-4 h-4" />
							</Button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
