import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { MotionValue } from "framer-motion";
import { modeIcons, modeLabels } from "../../constants";
import type { SidebarMode } from "../../types";
import { AnimatedBackground } from "../AnimatedBackground";

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
		<div className="flex items-center justify-center gap-1 px-2 pt-2">
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
						<Tooltip key={mode}>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => onModeSelect(mode)}
									className={`relative z-10 h-8 w-8 rounded-sm flex items-center justify-center transition-colors duration-150 ${isActive
										? "text-neutral-100"
										: "text-neutral-600 hover:text-neutral-500"
										}`}
								>
									<Icon className="w-3.5 h-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="top">
								<p>{label}</p>
							</TooltipContent>
						</Tooltip>
					);
				})}
			</div>
		</div>
	);
}
