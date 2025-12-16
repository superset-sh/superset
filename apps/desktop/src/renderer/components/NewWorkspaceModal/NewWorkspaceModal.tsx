import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { useState } from "react";
import { HiChevronDown, HiChevronUp, HiMiniFolderOpen } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useOpenNew } from "renderer/react-query/projects";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import {
	useCloseNewWorkspaceModal,
	useNewWorkspaceModalOpen,
} from "renderer/stores/new-workspace-modal";

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

export function NewWorkspaceModal() {
	const isOpen = useNewWorkspaceModalOpen();
	const closeModal = useCloseNewWorkspaceModal();
	const [showAllProjects, setShowAllProjects] = useState(false);

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

	const handleClose = () => {
		closeModal();
		setShowAllProjects(false);
	};

	const handleCreateWorkspace = async (projectId: string) => {
		toast.promise(createWorkspace.mutateAsync({ projectId }), {
			loading: "Creating workspace...",
			success: () => {
				handleClose();
				return "Workspace created";
			},
			error: (err) =>
				err instanceof Error ? err.message : "Failed to create workspace",
		});
	};

	const handleOpenNewProject = async () => {
		handleClose();
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
			handleCreateWorkspace(result.project.id);
		} catch (error) {
			toast.error("Failed to open project", {
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		}
	};

	return (
		<Dialog modal open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>New Workspace</DialogTitle>
					<DialogDescription>
						Select a project to create a new workspace
					</DialogDescription>
				</DialogHeader>

				<div className="mt-2 space-y-3">
					{currentProject && (
						<div>
							<p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
								Current project
							</p>
							<button
								type="button"
								onClick={() => handleCreateWorkspace(currentProject.id)}
								disabled={createWorkspace.isPending}
								className="w-full text-left px-3 py-2.5 text-sm rounded-lg border border-border hover:bg-accent transition-colors group"
							>
								<div className="font-medium truncate">
									{currentProject.name}
								</div>
								<div className="text-[11px] text-muted-foreground truncate group-hover:text-muted-foreground/80 mt-0.5">
									{formatPath(
										currentProject.mainRepoPath,
										currentProject.name,
										homeDir,
									)}
								</div>
							</button>
						</div>
					)}

					{otherProjects.length > 0 && (
						<div>
							<p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
								{currentProject ? "Other projects" : "Recent projects"}
							</p>
							<div className="space-y-1">
								{visibleProjects.map((project) => (
									<button
										type="button"
										key={project.id}
										onClick={() => handleCreateWorkspace(project.id)}
										disabled={createWorkspace.isPending}
										className="w-full text-left px-3 py-2.5 text-sm rounded-lg border border-border hover:bg-accent transition-colors group"
									>
										<div className="font-medium truncate">{project.name}</div>
										<div className="text-[11px] text-muted-foreground truncate group-hover:text-muted-foreground/80 mt-0.5">
											{formatPath(project.mainRepoPath, project.name, homeDir)}
										</div>
									</button>
								))}
							</div>
							{hasMoreProjects && (
								<button
									type="button"
									onClick={() => setShowAllProjects(!showAllProjects)}
									className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
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

					<div className="pt-2 border-t border-border">
						<Button
							variant="outline"
							onClick={handleOpenNewProject}
							disabled={openNew.isPending || createWorkspace.isPending}
							className="w-full justify-start gap-2"
						>
							<HiMiniFolderOpen className="size-4" />
							Browse for Project...
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
