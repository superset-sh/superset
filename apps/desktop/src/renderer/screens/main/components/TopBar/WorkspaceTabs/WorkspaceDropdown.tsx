import { Button } from "@superset/ui/button";
import { ButtonGroup } from "@superset/ui/button-group";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useRef } from "react";
import { HiChevronDown, HiMiniPlus } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useOpenNew } from "renderer/react-query/projects";
import {
	useCreateBranchWorkspace,
	useCreateWorkspace,
} from "renderer/react-query/workspaces";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";

export interface WorkspaceDropdownProps {
	className?: string;
}

export function WorkspaceDropdown({ className }: WorkspaceDropdownProps) {
	const primaryButtonRef = useRef<HTMLButtonElement>(null);
	const chevronButtonRef = useRef<HTMLButtonElement>(null);

	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const { data: recentProjects = [] } = trpc.projects.getRecents.useQuery();
	const createWorkspace = useCreateWorkspace();
	const createBranchWorkspace = useCreateBranchWorkspace();
	const openNew = useOpenNew();
	const openModal = useOpenNewWorkspaceModal();

	const currentProject = recentProjects.find(
		(p) => p.id === activeWorkspace?.projectId,
	);

	const handlePrimaryAction = () => {
		primaryButtonRef.current?.blur();
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

	const handleChevronClick = () => {
		chevronButtonRef.current?.blur();
		openModal();
	};

	return (
		<ButtonGroup
			className={[className, "group/split"].filter(Boolean).join(" ")}
		>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						ref={primaryButtonRef}
						variant="ghost"
						size="icon"
						aria-label="New workspace"
						className="ml-1 mt-1 size-7 text-muted-foreground hover:text-foreground group-hover/split:bg-accent/30 hover:!bg-accent"
						onClick={handlePrimaryAction}
						disabled={
							createWorkspace.isPending ||
							createBranchWorkspace.isPending ||
							openNew.isPending
						}
					>
						<HiMiniPlus className="size-5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={4}>
					{currentProject
						? `New workspace in ${currentProject.name}`
						: "New workspace"}
				</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						ref={chevronButtonRef}
						variant="ghost"
						size="icon"
						aria-label="More workspace options"
						className="mt-1 size-7 w-4 text-muted-foreground hover:text-foreground group-hover/split:bg-accent/30 hover:!bg-accent"
						onClick={handleChevronClick}
					>
						<HiChevronDown className="size-2.5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={4}>
					More options
				</TooltipContent>
			</Tooltip>
		</ButtonGroup>
	);
}
