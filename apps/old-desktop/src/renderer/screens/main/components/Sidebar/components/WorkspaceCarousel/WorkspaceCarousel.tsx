import { type MotionValue, useMotionValue } from "framer-motion";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type { Workspace } from "shared/types";

interface WorkspaceCarouselProps {
	workspaces: Workspace[];
	currentWorkspace: Workspace | null;
	onWorkspaceSelect: (workspaceId: string) => void;
	children: (workspace: Workspace | null, isActive: boolean) => ReactNode;
	onScrollProgress: (progress: MotionValue<number>) => void;
	isDragging?: boolean;
}

export function WorkspaceCarousel({
	workspaces,
	currentWorkspace,
	onWorkspaceSelect,
	children,
	onScrollProgress,
	isDragging = false,
}: WorkspaceCarouselProps) {
	const scrollTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
	const isInitialMount = useRef(true);

	const currentIndex = workspaces.findIndex(
		(w) => w.id === currentWorkspace?.id,
	);
	const initialProgress = currentIndex >= 0 ? currentIndex : 0;
	const workspaceProgress = useMotionValue(initialProgress);

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
			workspaceProgress.set(progress);
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
	}, [scrollContainer, workspaceProgress]);

	// Expose scroll progress to parent
	useEffect(() => {
		onScrollProgress(workspaceProgress);
	}, [onScrollProgress, workspaceProgress]);

	// Scroll to current workspace when it changes externally (e.g., clicking WorkspaceSwitcher)
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

	// Detect when user finishes scrolling and update current workspace
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

				// Calculate which workspace we're closest to
				const newIndex = Math.round(scrollLeft / containerWidth);

				// Update workspace if it changed
				if (
					newIndex >= 0 &&
					newIndex < workspaces.length &&
					workspaces[newIndex] &&
					workspaces[newIndex].id !== currentWorkspace?.id
				) {
					onWorkspaceSelect(workspaces[newIndex].id);
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
	}, [
		workspaces,
		currentWorkspace,
		onWorkspaceSelect,
		scrollContainer,
		isDragging,
	]);

	// If only one workspace or no workspaces, disable carousel
	if (workspaces.length <= 1) {
		return (
			<div className="flex-1 overflow-y-auto px-3">
				{children(currentWorkspace, true)}
			</div>
		);
	}

	return (
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
				style={{ width: `${workspaces.length * 100}%` }}
			>
				{workspaces.map((workspace) => (
					<div
						key={workspace.id}
						className="overflow-y-auto px-3"
						style={{
							scrollSnapAlign: "start",
							scrollSnapStop: "always",
							width: `${100 / workspaces.length}%`,
						}}
					>
						{children(workspace, workspace.id === currentWorkspace?.id)}
					</div>
				))}
			</div>
		</div>
	);
}
