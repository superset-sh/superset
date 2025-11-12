import type { MotionValue, ReactNode } from "react";

export type SidebarMode = "tabs" | "diff";

export interface ModeCarouselProps {
	modes: SidebarMode[];
	currentMode: SidebarMode;
	onModeSelect: (mode: SidebarMode) => void;
	children: (mode: SidebarMode, isActive: boolean) => ReactNode;
	onScrollProgress: (progress: MotionValue<number>) => void;
	isDragging?: boolean;
}

