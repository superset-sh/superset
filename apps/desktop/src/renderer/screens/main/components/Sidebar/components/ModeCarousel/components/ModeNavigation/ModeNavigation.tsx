import { Button } from "@superset/ui/button";
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
		<div className="flex items-center justify-center gap-1 px-2 py-2 border-t border-neutral-800/50 bg-neutral-900/50 backdrop-blur-sm">
			<div className="relative flex items-center gap-1">
				<AnimatedBackground
					progress={scrollProgress}
					modeCount={modes.length}
				/>

				{modes.map((mode) => {
					const Icon = modeIcons[mode];
					const isActive = mode === currentMode;

					return (
						<Tooltip key={mode}>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => onModeSelect(mode)}
									className={`relative z-10 h-9 w-9 rounded transition-colors duration-200 ${isActive
										? "text-neutral-100"
										: "text-neutral-400 hover:text-neutral-300"
										}`}
								>
									<Icon className="w-4 h-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top">
								<p className="text-xs">{modeLabels[mode]}</p>
							</TooltipContent>
						</Tooltip>
					);
				})}
			</div>
		</div>
	);
}
