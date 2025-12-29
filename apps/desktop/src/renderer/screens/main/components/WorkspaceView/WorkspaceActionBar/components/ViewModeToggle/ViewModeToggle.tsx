import { cn } from "@superset/ui/utils";
import { trpc } from "renderer/lib/trpc";
import {
	useWorkspaceViewModeStore,
	type WorkspaceViewMode,
} from "renderer/stores/workspace-view-mode";

export function ViewModeToggle() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const workspaceId = activeWorkspace?.id;

	const viewModeByWorkspaceId = useWorkspaceViewModeStore(
		(s) => s.viewModeByWorkspaceId,
	);
	const setWorkspaceViewMode = useWorkspaceViewModeStore(
		(s) => s.setWorkspaceViewMode,
	);

	if (!workspaceId) return null;

	const currentMode = viewModeByWorkspaceId[workspaceId] ?? "workbench";

	const handleModeChange = (mode: WorkspaceViewMode) => {
		setWorkspaceViewMode(workspaceId, mode);
	};

	return (
		<div className="flex items-center bg-secondary/50 rounded-lg p-0.5">
			<button
				type="button"
				onClick={() => handleModeChange("workbench")}
				aria-pressed={currentMode === "workbench"}
				className={cn(
					"px-3 py-1 text-sm font-medium rounded-md transition-all",
					currentMode === "workbench"
						? "bg-background text-foreground shadow-sm"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				Workbench
			</button>
			<button
				type="button"
				onClick={() => handleModeChange("review")}
				aria-pressed={currentMode === "review"}
				className={cn(
					"px-3 py-1 text-sm font-medium rounded-md transition-all",
					currentMode === "review"
						? "bg-background text-foreground shadow-sm"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				Review
			</button>
		</div>
	);
}
