import { modeLabels } from "./constants";
import type { SidebarMode } from "./types";

interface ModeHeaderProps {
	mode: SidebarMode;
}

export function ModeHeader({ mode }: ModeHeaderProps) {
	return (
		<div className="px-3 py-2">
			<span className="text-sm font-medium text-sidebar-foreground/80">
				{modeLabels[mode]}
			</span>
		</div>
	);
}
