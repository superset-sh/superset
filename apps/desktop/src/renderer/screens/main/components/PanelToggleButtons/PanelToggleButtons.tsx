import { cn } from "@superset/ui/utils";
import { LuPanelLeft, LuPanelRight } from "react-icons/lu";
import {
	RightSidebarTab,
	useSidebarStore,
} from "renderer/stores/sidebar-state";

export function PanelToggleButtons() {
	const isLeftPanelOpen = useSidebarStore((s) => s.isLeftPanelOpen);
	const isRightPanelOpen = useSidebarStore((s) => s.isRightPanelOpen);
	const toggleLeftPanel = useSidebarStore((s) => s.toggleLeftPanel);
	const toggleRightPanel = useSidebarStore((s) => s.toggleRightPanel);
	const tabPositions = useSidebarStore((s) => s.tabPositions);

	const hasLeftTabs =
		tabPositions[RightSidebarTab.Changes] === "left" ||
		tabPositions[RightSidebarTab.Files] === "left";
	const hasRightTabs =
		tabPositions[RightSidebarTab.Changes] === "right" ||
		tabPositions[RightSidebarTab.Files] === "right";

	return (
		<div className="flex items-center gap-0.5">
			{hasLeftTabs && (
				<button
					type="button"
					onClick={toggleLeftPanel}
					className={cn(
						"flex items-center justify-center size-7 rounded transition-colors",
						isLeftPanelOpen
							? "text-foreground bg-muted"
							: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
					)}
				>
					<LuPanelLeft className="size-4" />
				</button>
			)}
			{hasRightTabs && (
				<button
					type="button"
					onClick={toggleRightPanel}
					className={cn(
						"flex items-center justify-center size-7 rounded transition-colors",
						isRightPanelOpen
							? "text-foreground bg-muted"
							: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
					)}
				>
					<LuPanelRight className="size-4" />
				</button>
			)}
		</div>
	);
}
