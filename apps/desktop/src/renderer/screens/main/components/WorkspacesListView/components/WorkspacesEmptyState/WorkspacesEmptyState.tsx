import { Button } from "@superset/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { LuFolderPlus } from "react-icons/lu";
import { useOpenProject } from "renderer/react-query/projects";

/**
 * Shown on the workspaces landing when no projects have been opened yet.
 * Calls out that a folder can be dragged anywhere into the window, and offers
 * a manual "Open folder" fallback for the same flow.
 */
export function WorkspacesEmptyState() {
	const navigate = useNavigate();
	// Opening a folder here creates a project; the project page is where the user
	// creates a workspace.
	const { openNew, isPending } = useOpenProject({ createWorkspace: false });

	const handleOpen = async () => {
		const [project] = await openNew();
		if (project) {
			navigate({
				to: "/project/$projectId",
				params: { projectId: project.id },
			});
		}
	};

	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-card px-6 text-center">
			<div className="flex size-16 items-center justify-center rounded-2xl border-2 border-dashed border-border text-muted-foreground">
				<LuFolderPlus className="size-7" />
			</div>

			<div className="space-y-1.5">
				<h2 className="text-base font-medium text-foreground">
					No workspaces yet
				</h2>
				<p className="max-w-xs text-sm text-muted-foreground">
					Drag a Git repo folder anywhere into the window to open it — or pick
					one manually.
				</p>
			</div>

			<Button onClick={handleOpen} disabled={isPending}>
				{isPending ? "Opening…" : "Open folder…"}
			</Button>
		</div>
	);
}
