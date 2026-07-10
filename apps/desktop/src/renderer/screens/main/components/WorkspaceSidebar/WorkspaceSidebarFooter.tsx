import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import {
	LuFolderOpen,
	LuFolderPlus,
	LuGitBranch,
	LuLayoutTemplate,
} from "react-icons/lu";
import { useOpenProject } from "renderer/react-query/projects";
import { useOpenMainRepoWorkspace } from "renderer/react-query/workspaces";
import {
	useOpenNewProjectModal,
	useOpenTemplateGalleryModal,
} from "renderer/stores/add-repository-modal";
import { STROKE_WIDTH } from "./constants";

interface WorkspaceSidebarFooterProps {
	isCollapsed?: boolean;
}

export function WorkspaceSidebarFooter({
	isCollapsed = false,
}: WorkspaceSidebarFooterProps) {
	const { openNew, isPending: isOpenPending } = useOpenProject();
	const openMainRepoWorkspace = useOpenMainRepoWorkspace();
	const openNewProject = useOpenNewProjectModal();
	const openTemplateGallery = useOpenTemplateGalleryModal();

	const handleOpenProject = async () => {
		try {
			const projects = await openNew();

			for (const project of projects) {
				try {
					await openMainRepoWorkspace.mutateAsync({
						projectId: project.id,
					});
				} catch (err) {
					toast.error(`Failed to open ${project.name}`, {
						description:
							err instanceof Error ? err.message : "Failed to create workspace",
					});
				}
			}
		} catch (error) {
			toast.error("Failed to open project", {
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		}
	};

	const openMainWorkspaceForProject = async (projectId: string) => {
		try {
			await openMainRepoWorkspace.mutateAsync({ projectId });
		} catch (err) {
			toast.error("Failed to open project", {
				description:
					err instanceof Error ? err.message : "Failed to create workspace",
			});
		}
	};

	const handleCloneProject = async () => {
		const result = await openNewProject();
		if (result) await openMainWorkspaceForProject(result.projectId);
	};

	const handleTemplateProject = async () => {
		const result = await openTemplateGallery();
		if (result) await openMainWorkspaceForProject(result.projectId);
	};

	const isLoading = isOpenPending || openMainRepoWorkspace.isPending;

	if (isCollapsed) {
		return (
			<div className="border-t border-border p-2 flex flex-col items-center gap-1">
				<DropdownMenu>
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-8 text-muted-foreground hover:text-foreground"
									disabled={isLoading}
								>
									<LuFolderPlus className="size-4" strokeWidth={STROKE_WIDTH} />
								</Button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent side="right">Add repository</TooltipContent>
					</Tooltip>
					<DropdownMenuContent side="top" align="start">
						<DropdownMenuItem onClick={handleOpenProject} disabled={isLoading}>
							<LuFolderOpen className="size-4" strokeWidth={STROKE_WIDTH} />
							Open project
						</DropdownMenuItem>
						<DropdownMenuItem onClick={handleCloneProject}>
							<LuGitBranch className="size-4" strokeWidth={STROKE_WIDTH} />
							Clone from URL
						</DropdownMenuItem>
						<DropdownMenuItem onClick={handleTemplateProject}>
							<LuLayoutTemplate className="size-4" strokeWidth={STROKE_WIDTH} />
							Start from a template
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		);
	}

	return (
		<div className="border-t border-border p-2 flex items-center gap-2">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
						disabled={isLoading}
					>
						<LuFolderPlus className="w-4 h-4" strokeWidth={STROKE_WIDTH} />
						<span>Add repository</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent side="top" align="start">
					<DropdownMenuItem onClick={handleOpenProject} disabled={isLoading}>
						<LuFolderOpen className="size-4" strokeWidth={STROKE_WIDTH} />
						Open project
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleCloneProject}>
						<LuGitBranch className="size-4" strokeWidth={STROKE_WIDTH} />
						Clone from URL
					</DropdownMenuItem>
					<DropdownMenuItem onClick={handleTemplateProject}>
						<LuLayoutTemplate className="size-4" strokeWidth={STROKE_WIDTH} />
						Start from a template
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
