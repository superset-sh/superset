import type { MotionValue } from "framer-motion";
import { AnimatedBackground } from "./AnimatedBackground";
import { modeIcons, modeLabels } from "./constants";
import type { SidebarMode } from "./types";

interface ModeNavigationProps {
	modes: SidebarMode[];
	currentMode: SidebarMode;
	onModeSelect: (mode: SidebarMode) => void;
	scrollProgress: MotionValue<number>;
}

export function ModeNavigation({
	modes,
	currentMode,
	onModeSelect,
	scrollProgress,
}: ModeNavigationProps) {
	return (
		<div className="flex items-center justify-center gap-1 px-2 pb-3 pt-2 border-t border-sidebar-border">
			<div className="relative flex items-center gap-1">
				<AnimatedBackground
					progress={scrollProgress}
					modeCount={modes.length}
				/>

				{modes.map((mode) => {
					const Icon = modeIcons[mode];
					const isActive = mode === currentMode;
					const label = modeLabels[mode];

					return (
						<button
							key={mode}
							type="button"
							onClick={() => onModeSelect(mode)}
							title={label}
							className={`relative z-10 h-8 w-8 rounded-sm flex items-center justify-center transition-colors duration-150 ${
								isActive
									? "text-sidebar-foreground"
									: "text-sidebar-foreground/60 hover:text-sidebar-foreground/80"
							}`}
						>
							<Icon className="w-3.5 h-3.5" />
						</button>
					);
				})}
			</div>
		</div>
	);
}
