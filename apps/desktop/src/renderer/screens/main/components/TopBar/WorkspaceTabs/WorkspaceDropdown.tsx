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
	HiCheck,
	HiChevronDown,
	HiChevronUp,
	HiMagnifyingGlass,
	HiMiniFolderOpen,
	HiMiniPlus,
} from "react-icons/hi2";
import { LuGitBranch } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import { useOpenNew } from "renderer/react-query/projects";
import {
	useCreateBranchWorkspace,
	useCreateWorkspace,
	useSetActiveWorkspace,
} from "renderer/react-query/workspaces";

const INITIAL_PROJECTS_LIMIT = 5;
const INITIAL_BRANCHES_LIMIT = 6;

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
	const [showAllBranches, setShowAllBranches] = useState(false);
	const [branchSearch, setBranchSearch] = useState("");
	const primaryButtonRef = useRef<HTMLButtonElement>(null);
	const dropdownTriggerRef = useRef<HTMLButtonElement>(null);
	const searchInputRef = useRef<HTMLInputElement>(null);

	const utils = trpc.useUtils();
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const { data: recentProjects = [] } = trpc.projects.getRecents.useQuery();
	const { data: homeDir } = trpc.window.getHomeDir.useQuery();
	const { data: allWorkspaces } = trpc.workspaces.getAllGrouped.useQuery();
	const createWorkspace = useCreateWorkspace();
	const createBranchWorkspace = useCreateBranchWorkspace();
	const setActiveWorkspace = useSetActiveWorkspace();
	const openNew = useOpenNew();

	// Get branches for current project when dropdown is open
	const currentProjectId = activeWorkspace?.projectId;
	const { data: branches } = trpc.workspaces.getBranches.useQuery(
		{ projectId: currentProjectId ?? "" },
		{ enabled: isOpen && !!currentProjectId },
	);

	// Get current project's workspaces to check which branches are already open
	const currentProjectWorkspaces =
		allWorkspaces?.find((g) => g.project.id === currentProjectId)?.workspaces ??
		[];
	// Find existing branch workspace (only one allowed per project)
	const existingBranchWorkspace = currentProjectWorkspaces.find(
		(w) => w.type === "branch",
	);
	// Map worktree workspaces by branch for quick lookup
	const worktreeWorkspaceMap = new Map(
		currentProjectWorkspaces
			.filter((w) => w.type === "worktree")
			.map((w) => [w.branch, w.id]),
	);

	const switchBranchWorkspace =
		trpc.workspaces.switchBranchWorkspace.useMutation({
			onSuccess: () => {
				utils.workspaces.invalidate();
			},
		});

	// Combine and dedupe branches, with main/master at top
	const allBranches = branches
		? Array.from(new Set([...branches.local, ...branches.remote])).sort(
				(a, b) => {
					// Main/master always first
					if (a === "main" || a === "master") return -1;
					if (b === "main" || b === "master") return 1;
					// Then alphabetically
					return a.localeCompare(b);
				},
			)
		: [];

	// Filter branches by search
	const filteredBranches = branchSearch
		? allBranches.filter((b) =>
				b.toLowerCase().includes(branchSearch.toLowerCase()),
			)
		: allBranches;

	const visibleBranches = showAllBranches
		? filteredBranches
		: filteredBranches.slice(0, INITIAL_BRANCHES_LIMIT);
	const hasMoreBranches = filteredBranches.length > INITIAL_BRANCHES_LIMIT;

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
		setShowAllBranches(false);
		setBranchSearch("");
		primaryButtonRef.current?.blur();
		dropdownTriggerRef.current?.blur();
	};

	const handleBranchClick = async (branch: string) => {
		if (!currentProjectId) return;

		// Check if there's a worktree workspace for this branch
		const worktreeWorkspaceId = worktreeWorkspaceMap.get(branch);
		if (worktreeWorkspaceId) {
			setActiveWorkspace.mutate({ id: worktreeWorkspaceId });
			closeDropdown();
			return;
		}

		// Check if the existing branch workspace is already on this branch
		if (existingBranchWorkspace?.branch === branch) {
			setActiveWorkspace.mutate({ id: existingBranchWorkspace.id });
			closeDropdown();
			return;
		}

		// If there's an existing branch workspace on a different branch, switch it
		if (existingBranchWorkspace) {
			toast.promise(
				switchBranchWorkspace.mutateAsync({
					projectId: currentProjectId,
					branch,
				}),
				{
					loading: `Switching to ${branch}...`,
					success: () => {
						// Explicitly activate the workspace for immediate view switch
						setActiveWorkspace.mutate({ id: existingBranchWorkspace.id });
						closeDropdown();
						return `Switched to ${branch}`;
					},
					error: (err) =>
						err instanceof Error ? err.message : "Failed to switch branch",
				},
			);
			return;
		}

		// No branch workspace exists, create one
		toast.promise(
			createBranchWorkspace.mutateAsync({
				projectId: currentProjectId,
				branch,
			}),
			{
				loading: `Switching to ${branch}...`,
				success: () => {
					closeDropdown();
					return `Switched to ${branch}`;
				},
				error: (err) =>
					err instanceof Error ? err.message : "Failed to switch branch",
			},
		);
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
				<DropdownMenuContent
					className="w-72 p-0 max-h-[70vh] overflow-y-auto"
					align="start"
				>
					{/* New workspace header */}
					<div className="px-3 py-2.5 border-b border-border/50">
						<p className="text-sm font-medium text-foreground">New Workspace</p>
						<p className="text-xs text-muted-foreground mt-0.5">
							Create a new worktree branch
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
					{/* Branches section - switch to existing branch */}
					{currentProject && allBranches.length > 0 && (
						<div className="py-1.5 border-t border-border/50">
							<p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-3 py-1 flex items-center gap-1.5">
								<LuGitBranch className="size-3" />
								Branches in {currentProject.name}
							</p>

							{/* Search input - only show if many branches */}
							{allBranches.length > INITIAL_BRANCHES_LIMIT && (
								<div className="px-2 pb-1.5">
									<div className="relative">
										<HiMagnifyingGlass className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
										<input
											ref={searchInputRef}
											type="text"
											value={branchSearch}
											onChange={(e) => setBranchSearch(e.target.value)}
											placeholder="Search branches..."
											className="w-full rounded-md border border-border bg-muted/50 pl-7 pr-2 py-1.5 text-xs outline-none focus:border-primary focus:bg-background placeholder:text-muted-foreground/60"
											onKeyDown={(e) => e.stopPropagation()}
										/>
									</div>
								</div>
							)}

							<div className="px-1.5 max-h-[180px] overflow-y-auto">
								{visibleBranches.length === 0 ? (
									<p className="text-xs text-muted-foreground px-2 py-2">
										No branches found
									</p>
								) : (
									visibleBranches.map((branch) => {
										const isActive = activeWorkspace?.branch === branch;
										const hasWorktreeWorkspace =
											worktreeWorkspaceMap.has(branch);
										const isMainBranch =
											branch === "main" || branch === "master";

										return (
											<button
												type="button"
												key={branch}
												onClick={() => handleBranchClick(branch)}
												disabled={
													createBranchWorkspace.isPending ||
													switchBranchWorkspace.isPending
												}
												className={`
													w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors
													flex items-center gap-2
													${isActive ? "bg-accent/50" : "hover:bg-accent"}
												`}
											>
												<LuGitBranch
													className={`size-3.5 shrink-0 ${isActive ? "text-foreground" : "text-muted-foreground"}`}
												/>
												<span
													className={`truncate flex-1 ${isActive ? "font-medium" : ""}`}
												>
													{branch}
												</span>
												{isMainBranch && !isActive && (
													<span className="text-[10px] text-muted-foreground/60 shrink-0">
														default
													</span>
												)}
												{isActive && (
													<HiCheck className="size-3.5 text-foreground shrink-0" />
												)}
												{!isActive && hasWorktreeWorkspace && (
													<span className="size-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
												)}
											</button>
										);
									})
								)}
							</div>
							{hasMoreBranches && !branchSearch && (
								<button
									type="button"
									onClick={() => setShowAllBranches(!showAllBranches)}
									className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
								>
									{showAllBranches ? (
										<>
											<HiChevronUp className="size-3" />
											Show less
										</>
									) : (
										<>
											<HiChevronDown className="size-3" />
											Show {filteredBranches.length - INITIAL_BRANCHES_LIMIT}{" "}
											more
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
