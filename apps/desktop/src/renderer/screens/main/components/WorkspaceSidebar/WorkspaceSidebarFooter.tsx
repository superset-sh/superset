import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { LuFolderPlus } from "react-icons/lu";
import { useOpenNew } from "renderer/react-query/projects";
import { useCreateBranchWorkspace } from "renderer/react-query/workspaces";

export function WorkspaceSidebarFooter() {
	const openNew = useOpenNew();
	const createBranchWorkspace = useCreateBranchWorkspace();

	const handleOpenNewProject = async () => {
		try {
			const result = await openNew.mutateAsync(undefined);
			if (result.canceled) {
				return;
			}
			if ("error" in result) {
				toast.error("Failed to open project", {
					description: result.error,
				});
				return;
			}
			if ("needsGitInit" in result) {
				toast.error("Selected folder is not a git repository", {
					description:
						"Please use 'Open project' from the start view to initialize git.",
				});
				return;
			}
			// Create a main workspace on the current branch for the new project
			toast.promise(
				createBranchWorkspace.mutateAsync({ projectId: result.project.id }),
				{
					loading: "Opening project...",
					success: "Project opened",
					error: (err) =>
						err instanceof Error ? err.message : "Failed to open project",
				},
			);
		} catch (error) {
			toast.error("Failed to open project", {
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		}
	};

	return (
		<div className="border-t border-border p-2">
			<Button
				variant="ghost"
				size="sm"
				className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
				onClick={handleOpenNewProject}
				disabled={openNew.isPending || createBranchWorkspace.isPending}
			>
				<LuFolderPlus className="w-4 h-4" />
				<span>Add project</span>
			</Button>
		</div>
	);
}
