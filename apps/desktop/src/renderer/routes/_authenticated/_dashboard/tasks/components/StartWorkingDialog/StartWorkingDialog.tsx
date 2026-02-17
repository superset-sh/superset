import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { ScrollArea } from "@superset/ui/scroll-area";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useEffect, useRef, useState } from "react";
import { HiCheck, HiChevronDown, HiXMark } from "react-icons/hi2";
import { LuFolderOpen, LuLoader } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	processOpenNewResults,
	useOpenNew,
} from "renderer/react-query/projects";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import {
	useCloseStartWorkingModal,
	useStartWorkingModalOpen,
	useStartWorkingModalTasks,
} from "renderer/stores/start-working-modal";
import { sanitizeSegment } from "shared/utils/branch";
import { formatTaskContext } from "../../utils/formatTaskContext";
import type { TaskWithStatus } from "../TasksView/hooks/useTasksTable";

export function StartWorkingDialog() {
	const isOpen = useStartWorkingModalOpen();
	const tasks = useStartWorkingModalTasks();
	const closeModal = useCloseStartWorkingModal();

	const isBatch = tasks.length > 1;
	const singleTask = tasks.length === 1 ? tasks[0] : null;

	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		null,
	);
	const [additionalContext, setAdditionalContext] = useState("");
	const [taskStatuses, setTaskStatuses] = useState<
		Record<string, "pending" | "creating" | "done" | "failed">
	>({});
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const currentBatchTaskRef = useRef<TaskWithStatus | null>(null);

	const isBatchInProgress = Object.keys(taskStatuses).length > 0;

	const { data: recentProjects = [] } =
		electronTrpc.projects.getRecents.useQuery();

	// Single-task workspace creation (navigates after)
	const createWorkspace = useCreateWorkspace({
		resolveInitialCommands: () => {
			if (!singleTask) return null;
			const command = formatTaskContext({
				task: singleTask,
				additionalContext: additionalContext.trim() || undefined,
			});
			return [command];
		},
	});

	// Batch workspace creation (skips navigation)
	const createBatchWorkspace = useCreateWorkspace({
		skipNavigation: true,
		resolveInitialCommands: () => {
			const task = currentBatchTaskRef.current;
			if (!task) return null;
			const command = formatTaskContext({ task });
			return [command];
		},
	});

	const openNew = useOpenNew();

	const selectedProject = recentProjects.find(
		(p) => p.id === selectedProjectId,
	);

	// Auto-select first project if only one exists
	useEffect(() => {
		if (isOpen && !selectedProjectId && recentProjects.length === 1) {
			setSelectedProjectId(recentProjects[0].id);
		}
	}, [isOpen, selectedProjectId, recentProjects]);

	// Focus textarea when project is selected (single mode only)
	useEffect(() => {
		if (isOpen && selectedProjectId && !isBatch) {
			const timer = setTimeout(() => textareaRef.current?.focus(), 50);
			return () => clearTimeout(timer);
		}
	}, [isOpen, selectedProjectId, isBatch]);

	const resetForm = () => {
		setSelectedProjectId(null);
		setAdditionalContext("");
		setTaskStatuses({});
		currentBatchTaskRef.current = null;
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

			if ("results" in result) {
				const { successes } = processOpenNewResults({
					results: result.results,
					showSuccessToast: false,
					showGitInitToast: true,
				});

				if (successes.length > 0) {
					setSelectedProjectId(successes[0].project.id);
				}
			}
		} catch (error) {
			toast.error("Failed to open project", {
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		}
	};

	const handleCreateWorkspace = async () => {
		if (!selectedProjectId) return;

		if (isBatch) {
			await handleBatchCreate();
		} else {
			await handleSingleCreate();
		}
	};

	const handleSingleCreate = async () => {
		if (!selectedProjectId || !singleTask) return;

		const workspaceName = singleTask.slug;
		const branchSlug = sanitizeSegment(singleTask.slug);

		try {
			const result = await createWorkspace.mutateAsync({
				projectId: selectedProjectId,
				name: workspaceName,
				branchName: branchSlug || undefined,
				applyPrefix: true,
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

	const handleBatchCreate = async () => {
		if (!selectedProjectId) return;

		const initialStatuses: Record<string, "pending"> = {};
		for (const task of tasks) {
			initialStatuses[task.id] = "pending";
		}
		setTaskStatuses(initialStatuses);

		let successCount = 0;
		for (const task of tasks) {
			currentBatchTaskRef.current = task;
			setTaskStatuses((prev) => ({ ...prev, [task.id]: "creating" }));

			const workspaceName = task.slug;
			const branchSlug = sanitizeSegment(task.slug);

			try {
				await createBatchWorkspace.mutateAsync({
					projectId: selectedProjectId,
					name: workspaceName,
					branchName: branchSlug || undefined,
					applyPrefix: true,
				});
				setTaskStatuses((prev) => ({ ...prev, [task.id]: "done" }));
				successCount++;
			} catch (err) {
				console.error(
					`[StartWorkingDialog] Failed to create workspace for ${task.slug}:`,
					err,
				);
				setTaskStatuses((prev) => ({ ...prev, [task.id]: "failed" }));
			}
		}

		handleClose();

		if (successCount > 0) {
			toast.success(
				`Created ${successCount} workspace${successCount > 1 ? "s" : ""}`,
				{
					description: "Launching Claude for each task...",
				},
			);
		}
	};

	const isPending =
		createWorkspace.isPending ||
		createBatchWorkspace.isPending ||
		isBatchInProgress;

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (
			e.key === "Enter" &&
			(e.metaKey || e.ctrlKey) &&
			selectedProjectId &&
			!isPending
		) {
			e.preventDefault();
			handleCreateWorkspace();
		}
	};

	if (tasks.length === 0) return null;

	return (
		<Dialog
			modal
			open={isOpen}
			onOpenChange={(open) => {
				if (!open && !isPending) handleClose();
			}}
		>
			<DialogContent
				className="sm:max-w-[480px] max-h-[85vh] gap-0 p-0 flex flex-col overflow-hidden"
				onKeyDown={handleKeyDown}
				onEscapeKeyDown={(e) => {
					if (isPending) e.preventDefault();
				}}
				onPointerDownOutside={(e) => {
					if (isPending) e.preventDefault();
				}}
			>
				<DialogHeader className="px-4 pt-4 pb-3 shrink-0">
					<DialogTitle className="text-base">New Workspace</DialogTitle>
					<DialogDescription className="text-xs text-muted-foreground">
						{isBatch
							? `Create ${tasks.length} new workspaces and run Claude on each task.`
							: "Create a new workspace and run Claude on this task."}
					</DialogDescription>
				</DialogHeader>

				<div className="overflow-y-auto min-h-0">
					{/* Task context preview */}
					<div className="px-4 pb-3">
						{isBatch ? (
							<div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
								<p className="text-sm font-medium">
									{tasks.length} tasks selected
								</p>
								<ScrollArea className="max-h-[160px]">
									<div className="space-y-1.5">
										{tasks.map((task) => {
											const status = taskStatuses[task.id];
											return (
												<div
													key={task.id}
													className="flex items-center gap-2 text-xs"
												>
													{isBatchInProgress && (
														<BatchTaskStatusIcon status={status} />
													)}
													<span className="text-muted-foreground font-mono shrink-0">
														{task.slug}
													</span>
													<span className="truncate">{task.title}</span>
												</div>
											);
										})}
									</div>
								</ScrollArea>
							</div>
						) : singleTask ? (
							<div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
								<div className="flex items-center gap-2">
									<span className="text-xs text-muted-foreground font-mono">
										{singleTask.slug}
									</span>
									{singleTask.status && (
										<Badge
											variant="outline"
											className="text-[10px] px-1.5 py-0"
										>
											{singleTask.status.name}
										</Badge>
									)}
									{singleTask.priority && singleTask.priority !== "none" && (
										<Badge
											variant="outline"
											className="text-[10px] px-1.5 py-0"
										>
											{singleTask.priority}
										</Badge>
									)}
								</div>
								<p className="text-sm font-medium leading-snug">
									{singleTask.title}
								</p>
								{singleTask.description && (
									<p className="text-xs text-muted-foreground line-clamp-2">
										{singleTask.description}
									</p>
								)}
								{singleTask.labels && singleTask.labels.length > 0 && (
									<div className="flex gap-1 flex-wrap">
										{singleTask.labels.map((label) => (
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
						) : null}
					</div>

					{/* Project selector */}
					<div className="px-4 pb-3">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="outline"
									size="xs"
									className="w-full justify-between font-normal"
								>
									<span
										className={selectedProject ? "" : "text-muted-foreground"}
									>
										{selectedProject?.name ?? "Select project"}
									</span>
									<HiChevronDown className="text-muted-foreground" />
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
									<LuFolderOpen />
									Import repo
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>

					{/* Additional context (single mode only) */}
					{selectedProjectId && !isBatch && (
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
				</div>

				{/* Create button */}
				<div className="px-4 pb-4 shrink-0">
					<Button
						size="xs"
						className="w-full"
						onClick={handleCreateWorkspace}
						disabled={!selectedProjectId || isPending}
					>
						{isBatchInProgress
							? `Creating... (${Object.values(taskStatuses).filter((s) => s === "done" || s === "failed").length}/${tasks.length})`
							: createWorkspace.isPending
								? "Creating..."
								: isBatch
									? `Create ${tasks.length} Workspaces & Start Claude`
									: "Create Workspace & Start Claude"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function BatchTaskStatusIcon({
	status,
}: {
	status?: "pending" | "creating" | "done" | "failed";
}) {
	switch (status) {
		case "creating":
			return (
				<LuLoader className="size-3 shrink-0 text-blue-500 animate-spin" />
			);
		case "done":
			return <HiCheck className="size-3 shrink-0 text-green-500" />;
		case "failed":
			return <HiXMark className="size-3 shrink-0 text-red-500" />;
		default:
			return (
				<div className="size-3 shrink-0 rounded-full border border-border" />
			);
	}
}
