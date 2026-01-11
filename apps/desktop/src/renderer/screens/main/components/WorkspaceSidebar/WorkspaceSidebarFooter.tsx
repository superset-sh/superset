import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuFolderOpen } from "react-icons/lu";
import { useOpenNew } from "renderer/react-query/projects";
import { useCreateBranchWorkspace } from "renderer/react-query/workspaces";
import { STROKE_WIDTH } from "./constants";
import { OrganizationDropdown } from "./WorkspaceSidebarHeader/OrganizationDropdown";

interface WorkspaceSidebarFooterProps {
	isCollapsed?: boolean;
}

export function WorkspaceSidebarFooter({
	isCollapsed = false,
}: WorkspaceSidebarFooterProps) {
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

	if (isCollapsed) {
		return (
			<div className="border-t border-border p-2 flex flex-col items-center gap-2">
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-8 text-muted-foreground hover:text-foreground"
							onClick={handleOpenNewProject}
							disabled={openNew.isPending || createBranchWorkspace.isPending}
						>
							<LuFolderOpen className="size-4" strokeWidth={STROKE_WIDTH} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="right">Add repository</TooltipContent>
				</Tooltip>
				<OrganizationDropdown isCollapsed />
			</div>
		);
	}

	return (
		<div className="border-t border-border p-2 flex flex-col gap-1">
			<Button
				variant="ghost"
				size="sm"
				className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
				onClick={handleOpenNewProject}
				disabled={openNew.isPending || createBranchWorkspace.isPending}
			>
				<LuFolderOpen className="w-4 h-4" strokeWidth={STROKE_WIDTH} />
				<span>Add repository</span>
			</Button>
			<OrganizationDropdown />
		</div>
	);
}
