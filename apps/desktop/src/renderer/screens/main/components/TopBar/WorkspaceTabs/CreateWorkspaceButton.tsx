import { Button } from "@superset/ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "@superset/ui/button-group";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useRef } from "react";
import { HiMiniPlus, HiOutlineBolt } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useOpenNew } from "renderer/react-query/projects";
import {
	useCreateBranchWorkspace,
	useCreateWorkspace,
} from "renderer/react-query/workspaces";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";

export interface CreateWorkspaceButtonProps {
	className?: string;
}

export function CreateWorkspaceButton({
	className,
}: CreateWorkspaceButtonProps) {
	const modalButtonRef = useRef<HTMLButtonElement>(null);
	const quickCreateButtonRef = useRef<HTMLButtonElement>(null);

	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const { data: recentProjects = [] } = trpc.projects.getRecents.useQuery();
	const createWorkspace = useCreateWorkspace();
	const createBranchWorkspace = useCreateBranchWorkspace();
	const openNew = useOpenNew();
	const openModal = useOpenNewWorkspaceModal();

	const currentProject = recentProjects.find(
		(p) => p.id === activeWorkspace?.projectId,
	);

	const handleModalCreate = () => {
		modalButtonRef.current?.blur();
		openModal();
	};

	const handleQuickCreate = () => {
		quickCreateButtonRef.current?.blur();
		if (currentProject) {
			toast.promise(
				createWorkspace.mutateAsync({ projectId: currentProject.id }),
				{
					loading: "Creating workspace...",
					success: "Workspace created",
					error: (err) =>
						err instanceof Error ? err.message : "Failed to create workspace",
				},
			);
		} else {
			handleOpenNewProject();
		}
	};

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
		<ButtonGroup
			className={`${className} ml-1 mt-1 rounded-md border border-border/50`}
		>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						ref={modalButtonRef}
						variant="ghost"
						size="sm"
						aria-label="New workspace"
						className="h-7 gap-1 rounded-r-none px-2 text-muted-foreground hover:bg-accent hover:text-foreground"
						onClick={handleModalCreate}
					>
						<HiMiniPlus className="size-4" />
						<span className="text-xs">New</span>
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={4}>
					New workspace
				</TooltipContent>
			</Tooltip>
			<ButtonGroupSeparator />
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						ref={quickCreateButtonRef}
						variant="ghost"
						size="icon"
						aria-label="Quick create workspace"
						className="size-7 rounded-l-none text-muted-foreground hover:bg-accent hover:text-foreground"
						onClick={handleQuickCreate}
						disabled={
							createWorkspace.isPending ||
							createBranchWorkspace.isPending ||
							openNew.isPending
						}
					>
						<HiOutlineBolt className="size-3.5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={4}>
					{currentProject
						? `Quick create in ${currentProject.name}`
						: "Quick create workspace"}
				</TooltipContent>
			</Tooltip>
		</ButtonGroup>
	);
}
