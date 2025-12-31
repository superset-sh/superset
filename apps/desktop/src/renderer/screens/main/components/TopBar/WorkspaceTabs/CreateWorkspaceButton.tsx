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
import { HiFolderOpen, HiMiniPlus, HiOutlineBolt } from "react-icons/hi2";
import { HotkeyTooltipContent } from "renderer/components/HotkeyTooltipContent";
import { trpc } from "renderer/lib/trpc";
import { useOpenNew } from "renderer/react-query/projects";
import {
	useCreateBranchWorkspace,
	useCreateWorkspace,
} from "renderer/react-query/workspaces";
import { useAppHotkey, useHotkeyText } from "renderer/stores/hotkeys";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";

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
	const handleQuickCreateHotkey = useCallback(() => {
		if (!isLoading) handleQuickCreate();
	}, [isLoading, handleQuickCreate]);

	const handleOpenProjectHotkey = useCallback(() => {
		if (!isLoading) handleOpenNewProject();
	}, [isLoading, handleOpenNewProject]);

	useAppHotkey("NEW_WORKSPACE", handleModalCreate, undefined, [
		handleModalCreate,
	]);
	useAppHotkey("QUICK_CREATE_WORKSPACE", handleQuickCreateHotkey, undefined, [
		handleQuickCreateHotkey,
	]);
	useAppHotkey("OPEN_PROJECT", handleOpenProjectHotkey, undefined, [
		handleOpenProjectHotkey,
	]);

	const newWorkspaceShortcut = useHotkeyText("NEW_WORKSPACE");
	const quickCreateShortcut = useHotkeyText("QUICK_CREATE_WORKSPACE");
	const openProjectShortcut = useHotkeyText("OPEN_PROJECT");
	const showNewWorkspaceShortcut = newWorkspaceShortcut !== "Unassigned";
	const showQuickCreateShortcut = quickCreateShortcut !== "Unassigned";
	const showOpenProjectShortcut = openProjectShortcut !== "Unassigned";

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
				<TooltipContent side="bottom" sideOffset={4}>
					<HotkeyTooltipContent
						label="Create workspace or project"
						items={[
							{ label: "New Workspace", id: "NEW_WORKSPACE" },
							{
								label: "Quick Create",
								id: "QUICK_CREATE_WORKSPACE",
							},
							{ label: "Open Project", id: "OPEN_PROJECT" },
						]}
					/>
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
					{showNewWorkspaceShortcut && (
						<DropdownMenuShortcut className="opacity-40">
							{newWorkspaceShortcut}
						</DropdownMenuShortcut>
					)}
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={handleQuickCreate}
					disabled={isLoading}
					className="rounded-md text-[13px]"
				>
					<HiOutlineBolt className="size-[14px] opacity-60" />
					Quick Create
					{showQuickCreateShortcut && (
						<DropdownMenuShortcut className="opacity-40">
							{quickCreateShortcut}
						</DropdownMenuShortcut>
					)}
				</DropdownMenuItem>
				<DropdownMenuSeparator className="my-1 bg-border/40" />
				<DropdownMenuItem
					onClick={handleOpenNewProject}
					disabled={isLoading}
					className="rounded-md text-[13px]"
				>
					<HiFolderOpen className="size-[14px] opacity-60" />
					Open Project
					{showOpenProjectShortcut && (
						<DropdownMenuShortcut className="opacity-40">
							{openProjectShortcut}
						</DropdownMenuShortcut>
					)}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
