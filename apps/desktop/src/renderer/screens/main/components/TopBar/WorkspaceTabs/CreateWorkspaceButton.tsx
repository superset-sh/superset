import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useCallback, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { HiFolderOpen, HiMiniPlus, HiOutlineBolt } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useOpenNew } from "renderer/react-query/projects";
import {
	useCreateBranchWorkspace,
	useCreateWorkspace,
} from "renderer/react-query/workspaces";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { HOTKEYS } from "shared/hotkeys";

export interface CreateWorkspaceButtonProps {
	className?: string;
}

export function CreateWorkspaceButton({
	className,
}: CreateWorkspaceButtonProps) {
	const [open, setOpen] = useState(false);

	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const { data: recentProjects = [] } = trpc.projects.getRecents.useQuery();
	const createWorkspace = useCreateWorkspace();
	const createBranchWorkspace = useCreateBranchWorkspace();
	const openNew = useOpenNew();
	const openModal = useOpenNewWorkspaceModal();

	const currentProject = recentProjects.find(
		(p) => p.id === activeWorkspace?.projectId,
	);

	const isLoading =
		createWorkspace.isPending ||
		createBranchWorkspace.isPending ||
		openNew.isPending;

	const handleModalCreate = useCallback(() => {
		setOpen(false);
		openModal();
	}, [openModal]);

	const handleOpenNewProject = useCallback(async () => {
		setOpen(false);
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
	}, [openNew, createBranchWorkspace]);

	const handleQuickCreate = useCallback(() => {
		setOpen(false);
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
	}, [currentProject, createWorkspace, handleOpenNewProject]);

	// Keyboard shortcuts
	useHotkeys(HOTKEYS.NEW_WORKSPACE.keys, handleModalCreate, [
		handleModalCreate,
	]);
	useHotkeys(HOTKEYS.QUICK_CREATE_WORKSPACE.keys, () => {
		if (!isLoading) handleQuickCreate();
	}, [handleQuickCreate, isLoading]);
	useHotkeys(HOTKEYS.OPEN_PROJECT.keys, () => {
		if (!isLoading) handleOpenNewProject();
	}, [handleOpenNewProject, isLoading]);

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label="New workspace"
							disabled={isLoading}
							className={`${className} flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-all duration-150 hover:bg-foreground/[0.06] hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-40`}
						>
							<HiMiniPlus className="size-[18px] stroke-[0.5]" />
						</button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom" sideOffset={6} className="text-xs">
					New workspace
				</TooltipContent>
			</Tooltip>
			<DropdownMenuContent
				align="end"
				sideOffset={8}
				className="w-48 rounded-lg border-border/40 bg-popover/95 p-1 shadow-lg backdrop-blur-sm"
			>
				<DropdownMenuItem
					onClick={handleModalCreate}
					className="rounded-md text-[13px]"
				>
					<HiMiniPlus className="size-[14px] opacity-60" />
					New Workspace
					<DropdownMenuShortcut className="opacity-40">⌘N</DropdownMenuShortcut>
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={handleQuickCreate}
					disabled={isLoading}
					className="rounded-md text-[13px]"
				>
					<HiOutlineBolt className="size-[14px] opacity-60" />
					Quick Create
					<DropdownMenuShortcut className="opacity-40">
						⌘⇧N
					</DropdownMenuShortcut>
				</DropdownMenuItem>
				<DropdownMenuSeparator className="my-1 bg-border/40" />
				<DropdownMenuItem
					onClick={handleOpenNewProject}
					disabled={isLoading}
					className="rounded-md text-[13px]"
				>
					<HiFolderOpen className="size-[14px] opacity-60" />
					Open Project
					<DropdownMenuShortcut className="opacity-40">
						⌘⇧O
					</DropdownMenuShortcut>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
