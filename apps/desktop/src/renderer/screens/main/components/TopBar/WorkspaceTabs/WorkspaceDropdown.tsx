import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { HiChevronDown, HiMiniFolderOpen, HiMiniPlus } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useOpenNew } from "renderer/react-query/projects";
import { useCreateWorkspace } from "renderer/react-query/workspaces";

export interface WorkspaceDropdownProps {
	className?: string;
	activeProjectId?: string | null;
	activeProjectName?: string;
	activeProjectColor?: string;
}

export function WorkspaceDropdown({
	className,
	activeProjectId,
	activeProjectName,
	activeProjectColor,
}: WorkspaceDropdownProps) {
	const [isOpen, setIsOpen] = useState(false);

	const { data: recentProjects = [] } = trpc.projects.getRecents.useQuery();
	const createWorkspace = useCreateWorkspace();
	const openNew = useOpenNew();

	const handleCreateWorkspace = (projectId: string, closeDropdown = true) => {
		toast.promise(createWorkspace.mutateAsync({ projectId }), {
			loading: "Creating workspace...",
			success: () => {
				if (closeDropdown) {
					setIsOpen(false);
				}
				return "Workspace created";
			},
			error: (err) =>
				err instanceof Error ? err.message : "Failed to create workspace",
		});
	};

	const handleAddToCurrentProject = () => {
		if (activeProjectId) {
			handleCreateWorkspace(activeProjectId, false);
		}
	};

	const handleOpenNewProject = async () => {
		try {
			const result = await openNew.mutateAsync(undefined);
			if (!result.canceled && result.project) {
				handleCreateWorkspace(result.project.id);
			}
		} catch (error) {
			toast.error("Failed to open project", {
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		}
	};

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div
					className={`group/add flex items-center h-6 ml-2 ${className ?? ""}`}
				>
					<div className="flex items-center h-6 rounded transition-colors hover:bg-accent/50">
						{/* Plus button - creates workspace in current project */}
						<button
							type="button"
							aria-label="Add workspace to current project"
							onClick={handleAddToCurrentProject}
							disabled={!activeProjectId || createWorkspace.isPending}
							className="flex items-center justify-center h-6 w-6 rounded-l transition-colors hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
						>
							<HiMiniPlus className="size-5" />
						</button>

						{/* Dropdown for other options */}
						<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									aria-label="More workspace options"
									className="flex items-center justify-center h-6 w-4 rounded-r transition-colors hover:bg-accent"
								>
									<HiChevronDown className="size-2.5" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent className="w-80 p-0" align="end">
								<div className="py-2">
									{recentProjects.length > 0 && (
										<div className="px-2 pb-2 border-b">
											<p className="text-xs text-muted-foreground px-2 py-1.5">
												Recent Projects
											</p>
											{recentProjects.map((project) => (
												<button
													type="button"
													key={project.id}
													onClick={() => handleCreateWorkspace(project.id)}
													disabled={createWorkspace.isPending}
													className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors"
												>
													<div className="font-medium">{project.name}</div>
													<div className="text-xs text-muted-foreground truncate">
														{project.mainRepoPath}
													</div>
												</button>
											))}
										</div>
									)}
									<div className="px-2 pt-2">
										<button
											type="button"
											onClick={handleOpenNewProject}
											disabled={openNew.isPending || createWorkspace.isPending}
											className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors flex items-center gap-2"
										>
											<HiMiniFolderOpen className="h-4 w-4" />
											<span>Open New Project...</span>
										</button>
									</div>
								</div>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				{activeProjectName ? (
					<>
						New workspace in{" "}
						<span style={{ color: activeProjectColor }}>
							{activeProjectName}
						</span>
					</>
				) : (
					"New workspace"
				)}
			</TooltipContent>
		</Tooltip>
	);
}
