import { Button } from "@superset/ui/button";
import { type MotionValue, motion, useTransform } from "framer-motion";
import type { SidebarMode } from "../ModeCarousel";

interface ModeSwitcherProps {
	modes: SidebarMode[];
	currentMode: SidebarMode;
	onModeSelect: (mode: SidebarMode) => void;
	scrollProgress: MotionValue<number>;
}

const modeLabels: Record<SidebarMode, string> = {
	tabs: "Tabs",
	changes: "Changes",
};

export function ModeSwitcher({
	modes,
	currentMode,
	onModeSelect,
	scrollProgress,
}: ModeSwitcherProps) {
	// Calculate sliding background position from scroll progress
	// scrollProgress is 0-1 (0 = tabs, 1 = changes), and we have 2 modes, so each mode is 50% width
	// Transform to percentage: 0 -> 0%, 1 -> 50%
	const backgroundX = useTransform(scrollProgress, (value) => `${value * 50}%`);

	return (
		<div className="flex w-full border-b border-neutral-800/50">
			<div className="relative flex items-center w-full">
				{/* Sliding background indicator */}
				<motion.div
					className="absolute w-1/2 h-full bg-neutral-800/50"
					style={{ left: backgroundX }}
					initial={false}
					transition={{
						type: "spring",
						stiffness: 300,
						damping: 30,
					}}
				/>

				{modes.map((mode) => (
					<Button
						key={mode}
						variant="ghost"
						onClick={() => onModeSelect(mode)}
						className={`relative z-10 flex-1 h-8 rounded-none text-xs font-medium transition-colors ${
							currentMode === mode
								? "text-neutral-200"
								: "text-neutral-400 hover:text-neutral-300"
						}`}
					>
						{modeLabels[mode]}
					</Button>
				))}
			</div>
		</div>
	);
}

