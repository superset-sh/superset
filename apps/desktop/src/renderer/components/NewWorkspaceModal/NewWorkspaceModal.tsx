import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { useEffect, useState } from "react";
import { HiPlus } from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useOpenNew } from "renderer/react-query/projects";
import {
	useCreateBranchWorkspace,
	useCreateWorkspace,
} from "renderer/react-query/workspaces";
import {
	useCloseNewWorkspaceModal,
	useNewWorkspaceModalOpen,
} from "renderer/stores/new-workspace-modal";
import { ExistingWorktreesList } from "./components/ExistingWorktreesList";

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

type Mode = "existing" | "new";

export function NewWorkspaceModal() {
	const isOpen = useNewWorkspaceModalOpen();
	const closeModal = useCloseNewWorkspaceModal();
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		null,
	);
	const [title, setTitle] = useState("");
	const [branchName, setBranchName] = useState("");
	const [branchNameEdited, setBranchNameEdited] = useState(false);
	const [mode, setMode] = useState<Mode>("new");

	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const { data: recentProjects = [] } = trpc.projects.getRecents.useQuery();
	const createWorkspace = useCreateWorkspace();
	const createBranchWorkspace = useCreateBranchWorkspace();
	const openNew = useOpenNew();

	const currentProjectId = activeWorkspace?.projectId;

	// Auto-select current project when modal opens
	useEffect(() => {
		if (isOpen && currentProjectId && !selectedProjectId) {
			setSelectedProjectId(currentProjectId);
		}
	}, [isOpen, currentProjectId, selectedProjectId]);

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
		setMode("new");
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
			// Create a main workspace on the current branch for the new project
			await createBranchWorkspace.mutateAsync({ projectId: result.project.id });
			setSelectedProjectId(result.project.id);
		} catch (error) {
			toast.error("Failed to open project", {
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		}
	};

	return (
		<Dialog modal open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<DialogContent className="sm:max-w-[380px] gap-0 p-0 overflow-hidden">
				<DialogHeader className="px-4 pt-4 pb-3">
					<DialogTitle className="text-base">Open Workspace</DialogTitle>
				</DialogHeader>

				{/* Project Selector */}
				<div className="px-4 pb-3">
					<div className="flex items-center gap-2">
						<Select
							value={selectedProjectId ?? ""}
							onValueChange={setSelectedProjectId}
						>
							<SelectTrigger className="flex-1 h-8 text-sm">
								<SelectValue placeholder="Select project" />
							</SelectTrigger>
							<SelectContent>
								{recentProjects.map((project) => (
									<SelectItem key={project.id} value={project.id}>
										{project.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8 shrink-0"
							onClick={handleOpenNewProject}
							disabled={openNew.isPending}
						>
							<HiPlus className="h-4 w-4" />
						</Button>
					</div>
				</div>

				{selectedProjectId && (
					<>
						{/* Mode Switcher */}
						<div className="px-4 pb-2">
							<div className="flex p-0.5 bg-muted rounded-md">
								<button
									type="button"
									onClick={() => setMode("new")}
									className={`flex-1 px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
										mode === "new"
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									New Workspace
								</button>
								<button
									type="button"
									onClick={() => setMode("existing")}
									className={`flex-1 px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
										mode === "existing"
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									Existing
								</button>
							</div>
						</div>

						{/* Content */}
						<div className="px-4 pb-4">
							{mode === "new" ? (
								<div className="space-y-3">
									<div className="space-y-1.5">
										<label
											htmlFor="title"
											className="text-xs text-muted-foreground"
										>
											Title{" "}
											<span className="text-muted-foreground/60">
												(optional)
											</span>
										</label>
										<Input
											id="title"
											className="h-8 text-sm"
											placeholder="Feature name"
											value={title}
											onChange={(e) => setTitle(e.target.value)}
										/>
									</div>

									<div className="space-y-1.5">
										<label
											htmlFor="branch"
											className="text-xs text-muted-foreground"
										>
											Branch
										</label>
										<Input
											id="branch"
											className="h-8 text-sm font-mono"
											placeholder={
												title
													? generateBranchFromTitle(title)
													: "auto-generated"
											}
											value={branchName}
											onChange={(e) => handleBranchNameChange(e.target.value)}
										/>
									</div>
								</div>
							) : (
								<ExistingWorktreesList
									projectId={selectedProjectId}
									onOpenSuccess={handleClose}
								/>
							)}
						</div>
					</>
				)}

				{!selectedProjectId && (
					<div className="px-4 pb-4 pt-2">
						<div className="text-center text-sm text-muted-foreground py-8">
							Select a project to get started
						</div>
					</div>
				)}

				{mode === "new" && selectedProjectId && (
					<DialogFooter className="px-4 pb-4 pt-0">
						<Button
							className="w-full h-8 text-sm"
							onClick={handleCreateWorkspace}
							disabled={createWorkspace.isPending}
						>
							Create Workspace
						</Button>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}
