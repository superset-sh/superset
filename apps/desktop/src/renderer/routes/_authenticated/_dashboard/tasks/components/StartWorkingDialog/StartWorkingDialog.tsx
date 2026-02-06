import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useEffect, useRef, useState } from "react";
import { HiCheck, HiChevronDown } from "react-icons/hi2";
import { LuFolderOpen } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useOpenNew } from "renderer/react-query/projects";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import {
	useCloseStartWorkingModal,
	useStartWorkingModalOpen,
	useStartWorkingModalTask,
} from "renderer/stores/start-working-modal";
import { useWorkspaceInitStore } from "renderer/stores/workspace-init";
import { sanitizeSegment } from "shared/utils/branch";
import { formatTaskContext } from "../../utils/formatTaskContext";

export function StartWorkingDialog() {
	const isOpen = useStartWorkingModalOpen();
	const task = useStartWorkingModalTask();
	const closeModal = useCloseStartWorkingModal();

	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		null,
	);
	const [additionalContext, setAdditionalContext] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const { data: recentProjects = [] } =
		electronTrpc.projects.getRecents.useQuery();
	const createWorkspace = useCreateWorkspace();
	const openNew = useOpenNew();
	const addPendingTerminalSetup = useWorkspaceInitStore(
		(s) => s.addPendingTerminalSetup,
	);

	const selectedProject = recentProjects.find(
		(p) => p.id === selectedProjectId,
	);

	// Auto-select first project if only one exists
	useEffect(() => {
		if (isOpen && !selectedProjectId && recentProjects.length === 1) {
			setSelectedProjectId(recentProjects[0].id);
		}
	}, [isOpen, selectedProjectId, recentProjects]);

	// Focus textarea when project is selected
	useEffect(() => {
		if (isOpen && selectedProjectId) {
			const timer = setTimeout(() => textareaRef.current?.focus(), 50);
			return () => clearTimeout(timer);
		}
	}, [isOpen, selectedProjectId]);

	const resetForm = () => {
		setSelectedProjectId(null);
		setAdditionalContext("");
	};

	const handleClose = () => {
		closeModal();
		resetForm();
	};

	const handleImportRepo = async () => {
		try {
			const result = await openNew.mutateAsync(undefined);
			if (result.canceled) return;
			if ("error" in result) {
				toast.error("Failed to open project", { description: result.error });
				return;
			}
			if ("needsGitInit" in result) {
				toast.error("Selected folder is not a git repository");
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

	const handleCreateWorkspace = async () => {
		if (!selectedProjectId || !task) return;

		const workspaceName = task.slug;
		const branchSlug = sanitizeSegment(task.slug);

		const command = formatTaskContext({
			task,
			additionalContext: additionalContext.trim() || undefined,
		});

		try {
			const result = await createWorkspace.mutateAsync({
				projectId: selectedProjectId,
				name: workspaceName,
				branchName: branchSlug || undefined,
				applyPrefix: true,
			});

			// Override the pending terminal setup with our Claude command
			addPendingTerminalSetup({
				workspaceId: result.workspace.id,
				projectId: result.projectId,
				initialCommands: [command],
			});

			handleClose();

			if (result.isInitializing) {
				toast.success("Workspace created", {
					description: "Setting up and launching Claude...",
				});
			} else {
				toast.success("Workspace created", {
					description: "Launching Claude...",
				});
			}
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to create workspace",
			);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (
			e.key === "Enter" &&
			(e.metaKey || e.ctrlKey) &&
			selectedProjectId &&
			!createWorkspace.isPending
		) {
			e.preventDefault();
			handleCreateWorkspace();
		}
	};

	if (!task) return null;

	return (
		<Dialog modal open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<DialogContent
				className="sm:max-w-[480px] gap-0 p-0 overflow-hidden"
				onKeyDown={handleKeyDown}
			>
				<DialogHeader className="px-4 pt-4 pb-3">
					<DialogTitle className="text-base">Start Working</DialogTitle>
				</DialogHeader>

				{/* Task context preview */}
				<div className="px-4 pb-3">
					<div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
						<div className="flex items-center gap-2">
							<span className="text-xs text-muted-foreground font-mono">
								{task.slug}
							</span>
							{task.status && (
								<Badge variant="outline" className="text-[10px] px-1.5 py-0">
									{task.status.name}
								</Badge>
							)}
							{task.priority && task.priority !== "none" && (
								<Badge variant="outline" className="text-[10px] px-1.5 py-0">
									{task.priority}
								</Badge>
							)}
						</div>
						<p className="text-sm font-medium leading-snug">{task.title}</p>
						{task.description && (
							<p className="text-xs text-muted-foreground line-clamp-2">
								{task.description}
							</p>
						)}
						{task.labels && task.labels.length > 0 && (
							<div className="flex gap-1 flex-wrap">
								{task.labels.map((label) => (
									<Badge
										key={label}
										variant="secondary"
										className="text-[10px] px-1.5 py-0"
									>
										{label}
									</Badge>
								))}
							</div>
						)}
					</div>
				</div>

				{/* Project selector */}
				<div className="px-4 pb-3">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								className="w-full h-8 text-sm justify-between font-normal"
							>
								<span
									className={selectedProject ? "" : "text-muted-foreground"}
								>
									{selectedProject?.name ?? "Select project"}
								</span>
								<HiChevronDown className="size-4 text-muted-foreground" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="start"
							className="w-[--radix-dropdown-menu-trigger-width]"
						>
							{recentProjects
								.filter((project) => project.id)
								.map((project) => (
									<DropdownMenuItem
										key={project.id}
										onClick={() => setSelectedProjectId(project.id)}
									>
										{project.name}
										{project.id === selectedProjectId && (
											<HiCheck className="ml-auto size-4" />
										)}
									</DropdownMenuItem>
								))}
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={handleImportRepo}>
								<LuFolderOpen className="size-4" />
								Import repo
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				{/* Additional context */}
				{selectedProjectId && (
					<div className="px-4 pb-3">
						<Textarea
							ref={textareaRef}
							placeholder="Additional context or instructions for Claude (optional)"
							className="min-h-[80px] text-sm resize-none"
							value={additionalContext}
							onChange={(e) => setAdditionalContext(e.target.value)}
						/>
					</div>
				)}

				{/* Create button */}
				<div className="px-4 pb-4">
					<Button
						className="w-full h-8 text-sm"
						onClick={handleCreateWorkspace}
						disabled={!selectedProjectId || createWorkspace.isPending}
					>
						{createWorkspace.isPending
							? "Creating..."
							: "Create Workspace & Start Claude"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
