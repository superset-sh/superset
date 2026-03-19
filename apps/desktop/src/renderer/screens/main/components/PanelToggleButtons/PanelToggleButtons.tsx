import { cn } from "@superset/ui/utils";
import { LuPanelLeft, LuPanelRight } from "react-icons/lu";
import { useSidebarStore } from "renderer/stores/sidebar-state";

export function PanelToggleButtons() {
	const isLeftPanelOpen = useSidebarStore((s) => s.isLeftPanelOpen);
	const isRightPanelOpen = useSidebarStore((s) => s.isRightPanelOpen);
	const toggleLeftPanel = useSidebarStore((s) => s.toggleLeftPanel);
	const toggleRightPanel = useSidebarStore((s) => s.toggleRightPanel);

	return (
		<div className="no-drag flex items-center gap-0.5">
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
				<LuPanelLeft className="size-4" strokeWidth={1.5} />
			</button>
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
				<LuPanelRight className="size-4" strokeWidth={1.5} />
			</button>
		</div>
	);
}
