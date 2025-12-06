import { Button } from "@superset/ui/button";
import { ButtonGroup } from "@superset/ui/button-group";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useRef, useState } from "react";
import {
	HiChevronDown,
	HiChevronUp,
	HiMiniFolderOpen,
	HiMiniPlus,
} from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useOpenNew } from "renderer/react-query/projects";
import { useCreateWorkspace } from "renderer/react-query/workspaces";

const INITIAL_PROJECTS_LIMIT = 5;

/**
 * Formats a path for display, replacing the home directory with ~ and
 * removing the trailing project name directory.
 */
function formatPath(
	path: string,
	projectName: string,
	homeDir: string | undefined,
): string {
	const normalizedPath = path.replace(/\\/g, "/");
	const normalizedHome = homeDir ? homeDir.replace(/\\/g, "/") : null;

	let displayPath = normalizedPath;
	if (
		normalizedHome &&
		(normalizedPath === normalizedHome ||
			normalizedPath.startsWith(`${normalizedHome}/`))
	) {
		displayPath = `~${normalizedPath.slice(normalizedHome.length)}`;
	} else {
		displayPath = normalizedPath.replace(/^\/(?:Users|home)\/[^/]+/, "~");
	}

	const escapedProjectName = projectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const suffixPattern = new RegExp(`/${escapedProjectName}$`);
	return displayPath.replace(suffixPattern, "");
}

export interface WorkspaceDropdownProps {
	className?: string;
}

export function WorkspaceDropdown({ className }: WorkspaceDropdownProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [showAllProjects, setShowAllProjects] = useState(false);
	const primaryButtonRef = useRef<HTMLButtonElement>(null);
	const dropdownTriggerRef = useRef<HTMLButtonElement>(null);

	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const { data: recentProjects = [] } = trpc.projects.getRecents.useQuery();
	const { data: homeDir } = trpc.window.getHomeDir.useQuery();
	const createWorkspace = useCreateWorkspace();
	const openNew = useOpenNew();

	const currentProject = recentProjects.find(
		(p) => p.id === activeWorkspace?.projectId,
	);
	const otherProjects = recentProjects.filter(
		(p) => p.id !== activeWorkspace?.projectId,
	);
	const visibleProjects = showAllProjects
		? otherProjects
		: otherProjects.slice(0, INITIAL_PROJECTS_LIMIT);
	const hasMoreProjects = otherProjects.length > INITIAL_PROJECTS_LIMIT;

	const closeDropdown = () => {
		setIsOpen(false);
		setShowAllProjects(false);
		primaryButtonRef.current?.blur();
		dropdownTriggerRef.current?.blur();
	};

	const handleCreateWorkspace = async (projectId: string) => {
		toast.promise(createWorkspace.mutateAsync({ projectId }), {
			loading: "Creating workspace...",
			success: () => {
				closeDropdown();
				return "Workspace created";
			},
			error: (err) =>
				err instanceof Error ? err.message : "Failed to create workspace",
		});
	};

	const handleOpenNewProject = async () => {
		closeDropdown();
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
				// Folder is not a git repository - inform user to use Start view
				toast.error("Selected folder is not a git repository", {
					description:
						"Please use 'Open project' from the start view to initialize git.",
				});
				return;
			}
			handleCreateWorkspace(result.project.id);
		} catch (error) {
			toast.error("Failed to open project", {
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		}
	};

	const handlePrimaryAction = () => {
		primaryButtonRef.current?.blur();
		if (currentProject) {
			handleCreateWorkspace(currentProject.id);
		} else {
			handleOpenNewProject();
		}
	};

	const handleOpenChange = (open: boolean) => {
		if (open) {
			setIsOpen(true);
			dropdownTriggerRef.current?.blur();
		} else {
			closeDropdown();
		}
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
						disabled={createWorkspace.isPending || openNew.isPending}
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
			<DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
				<Tooltip>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<Button
								ref={dropdownTriggerRef}
								variant="ghost"
								size="icon"
								aria-label="More workspace options"
								className="mt-1 size-7 w-4 text-muted-foreground hover:text-foreground group-hover/split:bg-accent/30 hover:!bg-accent"
							>
								<HiChevronDown className="size-2.5" />
							</Button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent side="bottom" sideOffset={4}>
						More options
					</TooltipContent>
				</Tooltip>
				<DropdownMenuContent className="w-72 p-0" align="start">
					<div className="px-3 py-2.5 border-b border-border/50">
						<p className="text-sm font-medium text-foreground">New Workspace</p>
						<p className="text-xs text-muted-foreground mt-0.5">
							Select a project to create a workspace
						</p>
					</div>
					{currentProject && (
						<div className="py-1.5 border-b border-border/50">
							<p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-1">
								Current project
							</p>
							<div className="px-1.5">
								<button
									type="button"
									onClick={() => handleCreateWorkspace(currentProject.id)}
									disabled={createWorkspace.isPending}
									className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors group"
								>
									<div className="font-medium truncate">
										{currentProject.name}
									</div>
									<div className="text-[11px] text-muted-foreground truncate group-hover:text-muted-foreground/80">
										{formatPath(
											currentProject.mainRepoPath,
											currentProject.name,
											homeDir,
										)}
									</div>
								</button>
							</div>
						</div>
					)}
					{otherProjects.length > 0 && (
						<div className="py-1.5">
							<p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-1">
								{currentProject ? "Other projects" : "Recent projects"}
							</p>
							<div className="px-1.5">
								{visibleProjects.map((project) => (
									<button
										type="button"
										key={project.id}
										onClick={() => handleCreateWorkspace(project.id)}
										disabled={createWorkspace.isPending}
										className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors group"
									>
										<div className="font-medium truncate">{project.name}</div>
										<div className="text-[11px] text-muted-foreground truncate group-hover:text-muted-foreground/80">
											{formatPath(project.mainRepoPath, project.name, homeDir)}
										</div>
									</button>
								))}
							</div>
							{hasMoreProjects && (
								<button
									type="button"
									onClick={() => setShowAllProjects(!showAllProjects)}
									className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
								>
									{showAllProjects ? (
										<>
											<HiChevronUp className="size-3" />
											Show less
										</>
									) : (
										<>
											<HiChevronDown className="size-3" />
											Show {otherProjects.length - INITIAL_PROJECTS_LIMIT} more
										</>
									)}
								</button>
							)}
						</div>
					)}
					<div className="border-t border-border/50 p-1.5">
						<button
							type="button"
							onClick={handleOpenNewProject}
							disabled={openNew.isPending || createWorkspace.isPending}
							className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors flex items-center gap-2"
						>
							<HiMiniFolderOpen className="size-4 text-muted-foreground" />
							<span>Browse for Project...</span>
						</button>
					</div>
				</DropdownMenuContent>
			</DropdownMenu>
		</ButtonGroup>
	);
}
