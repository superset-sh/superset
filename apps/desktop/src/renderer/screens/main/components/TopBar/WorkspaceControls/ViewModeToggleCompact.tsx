import { cn } from "@superset/ui/utils";
import {
	useWorkspaceViewModeStore,
	type WorkspaceViewMode,
} from "renderer/stores/workspace-view-mode";

interface ViewModeToggleCompactProps {
	workspaceId: string;
}

export function ViewModeToggleCompact({
	workspaceId,
}: ViewModeToggleCompactProps) {
	// Select only this workspace's mode to minimize rerenders
	const currentMode = useWorkspaceViewModeStore(
		(s) => s.viewModeByWorkspaceId[workspaceId] ?? "workbench",
	);
	const setWorkspaceViewMode = useWorkspaceViewModeStore(
		(s) => s.setWorkspaceViewMode,
	);

	const handleModeChange = (mode: WorkspaceViewMode) => {
		setWorkspaceViewMode(workspaceId, mode);
	};

	const BUTTON_HEIGHT = 24;

	return (
		<div
			className="flex items-center bg-foreground/5 border border-foreground/10 rounded no-drag"
			style={{ height: `${BUTTON_HEIGHT}px` }}
		>
			<button
				type="button"
				aria-pressed={currentMode === "workbench"}
				onClick={() => handleModeChange("workbench")}
				className={cn(
					"px-2 h-full text-xs font-medium rounded-l transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
					currentMode === "workbench"
						? "bg-foreground/10 text-foreground"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				Workbench
			</button>
			<button
				type="button"
				aria-pressed={currentMode === "review"}
				onClick={() => handleModeChange("review")}
				className={cn(
					"px-2 h-full text-xs font-medium rounded-r transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
					currentMode === "review"
						? "bg-foreground/10 text-foreground"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				Review
			</button>
		</div>
	);
}
