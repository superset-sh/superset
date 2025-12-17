import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useEffect, useState } from "react";
import {
	HiCheck,
	HiChevronDown,
	HiChevronUp,
	HiMiniFolderOpen,
} from "react-icons/hi2";
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

/**
 * Generates a git-appropriate branch name from a title.
 */
function generateBranchFromTitle(title: string): string {
	if (!title.trim()) return "";

	return title
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 50);
}

export function NewWorkspaceModal() {
	const isOpen = useNewWorkspaceModalOpen();
	const closeModal = useCloseNewWorkspaceModal();

	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		null,
	);
	const [title, setTitle] = useState("");
	const [branchName, setBranchName] = useState("");
	const [branchNameEdited, setBranchNameEdited] = useState(false);
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

	// Auto-select current project when modal opens
	useEffect(() => {
		if (isOpen && currentProject && !selectedProjectId) {
			setSelectedProjectId(currentProject.id);
		}
	}, [isOpen, currentProject, selectedProjectId]);

	// Auto-generate branch name from title (unless manually edited)
	useEffect(() => {
		if (!branchNameEdited) {
			setBranchName(generateBranchFromTitle(title));
		}
	}, [title, branchNameEdited]);

	const resetForm = () => {
		setSelectedProjectId(null);
		setTitle("");
		setBranchName("");
		setBranchNameEdited(false);
		setShowAllProjects(false);
	};

	const handleClose = () => {
		closeModal();
		resetForm();
	};

	const handleBranchNameChange = (value: string) => {
		setBranchName(value);
		setBranchNameEdited(true);
	};

	const handleCreateWorkspace = async () => {
		if (!selectedProjectId) return;

		const workspaceName = title.trim() || undefined;
		const customBranchName = branchName.trim() || undefined;

		toast.promise(
			createWorkspace.mutateAsync({
				projectId: selectedProjectId,
				name: workspaceName,
				branchName: customBranchName,
			}),
			{
				loading: "Creating workspace...",
				success: () => {
					handleClose();
					return "Workspace created";
				},
				error: (err) =>
					err instanceof Error ? err.message : "Failed to create workspace",
			},
		);
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
			setSelectedProjectId(result.project.id);
		} catch (error) {
			toast.error("Failed to open project", {
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		}
	};

	const renderProjectButton = (
		project: { id: string; name: string; mainRepoPath: string },
		isSelected: boolean,
	) => (
		<button
			type="button"
			key={project.id}
			onClick={() => setSelectedProjectId(project.id)}
			className={`w-full text-left px-3 py-2 text-sm rounded-lg border transition-colors group flex items-center justify-between ${
				isSelected
					? "border-primary bg-primary/5"
					: "border-border hover:bg-accent"
			}`}
		>
			<div className="min-w-0 flex-1">
				<div className="font-medium truncate">{project.name}</div>
				<div className="text-[11px] text-muted-foreground truncate group-hover:text-muted-foreground/80 mt-0.5">
					{formatPath(project.mainRepoPath, project.name, homeDir)}
				</div>
			</div>
			{isSelected && <HiCheck className="size-4 text-primary shrink-0 ml-2" />}
		</button>
	);

	return (
		<Dialog modal open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>New Workspace</DialogTitle>
					<DialogDescription>
						Create a new workspace with an isolated git worktree
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{/* Project Selection */}
					<div className="space-y-2">
						<Label className="text-xs text-muted-foreground uppercase tracking-wider">
							Project
						</Label>
						<div className="space-y-1 max-h-48 overflow-y-auto">
							{currentProject &&
								renderProjectButton(
									currentProject,
									selectedProjectId === currentProject.id,
								)}
							{otherProjects.length > 0 && (
								<>
									{currentProject && (
										<div className="text-[10px] text-muted-foreground uppercase tracking-wider pt-2 pb-1">
											Other projects
										</div>
									)}
									{visibleProjects.map((project) =>
										renderProjectButton(
											project,
											selectedProjectId === project.id,
										),
									)}
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
													Show {otherProjects.length - INITIAL_PROJECTS_LIMIT}{" "}
													more
												</>
											)}
										</button>
									)}
								</>
							)}
							<button
								type="button"
								onClick={handleOpenNewProject}
								disabled={openNew.isPending}
								className="w-full text-left px-3 py-2 text-sm rounded-lg border border-dashed border-border hover:bg-accent transition-colors flex items-center gap-2 text-muted-foreground hover:text-foreground"
							>
								<HiMiniFolderOpen className="size-4" />
								Browse for Project...
							</button>
						</div>
					</div>

					{/* Optional Fields */}
					<div className="space-y-3 pt-2 border-t border-border">
						<div className="space-y-1.5">
							<Label htmlFor="title" className="text-sm">
								Title{" "}
								<span className="text-muted-foreground font-normal">
									(optional)
								</span>
							</Label>
							<Input
								id="title"
								placeholder="e.g., Add user authentication"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
							/>
						</div>

						<div className="space-y-1.5">
							<Label htmlFor="branch" className="text-sm">
								Branch name{" "}
								<span className="text-muted-foreground font-normal">
									(optional)
								</span>
							</Label>
							<Input
								id="branch"
								placeholder={
									title ? generateBranchFromTitle(title) : "Auto-generated"
								}
								value={branchName}
								onChange={(e) => handleBranchNameChange(e.target.value)}
							/>
							<p className="text-[11px] text-muted-foreground">
								Leave empty to auto-generate from title or use a random name
							</p>
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={handleClose}>
						Cancel
					</Button>
					<Button
						onClick={handleCreateWorkspace}
						disabled={!selectedProjectId || createWorkspace.isPending}
					>
						Create Workspace
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
