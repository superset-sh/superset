import {
	AGENT_LABELS,
	AGENT_TYPES,
	type AgentType,
} from "@superset/shared/agent-command";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useEffect, useRef, useState } from "react";
import { HiCheck, HiChevronDown, HiXMark } from "react-icons/hi2";
import { LuFolderOpen, LuLoader } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useOpenProject } from "renderer/react-query/projects";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import { ProjectThumbnail } from "renderer/screens/main/components/WorkspaceSidebar/ProjectSection/ProjectThumbnail";
import {
	useCloseStartWorkingModal,
	useStartWorkingModalOpen,
	useStartWorkingModalPreSelectedProjectId,
	useStartWorkingModalTasks,
} from "renderer/stores/start-working-modal";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useWorkspaceInitStore } from "renderer/stores/workspace-init";
import { buildAgentCommand } from "../../$taskId/utils/buildAgentCommand";
import { deriveBranchName } from "../../$taskId/utils/deriveBranchName";
import type { TaskWithStatus } from "../TasksView/hooks/useTasksTable";

export function StartWorkingDialog() {
	const isOpen = useStartWorkingModalOpen();
	const tasks = useStartWorkingModalTasks();
	const preSelectedProjectId = useStartWorkingModalPreSelectedProjectId();
	const closeModal = useCloseStartWorkingModal();

	const isBatch = tasks.length > 1;
	const singleTask = tasks.length === 1 ? tasks[0] : null;

	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		() => localStorage.getItem("lastOpenedInProjectId"),
	);

	// Apply pre-selected project when modal opens with one
	useEffect(() => {
		if (isOpen && preSelectedProjectId) {
			setSelectedProjectId(preSelectedProjectId);
			localStorage.setItem("lastOpenedInProjectId", preSelectedProjectId);
		}
	}, [isOpen, preSelectedProjectId]);
	const [selectedAgent, setSelectedAgent] = useState<AgentType>(() => {
		const stored = localStorage.getItem("lastSelectedAgent");
		return stored && (AGENT_TYPES as readonly string[]).includes(stored)
			? (stored as AgentType)
			: "claude";
	});
	const [additionalContext, setAdditionalContext] = useState("");
	const [taskStatuses, setTaskStatuses] = useState<
		Record<string, "pending" | "creating" | "done" | "failed">
	>({});
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const isBatchInProgress = Object.keys(taskStatuses).length > 0;
	const isDark = useIsDarkTheme();

	const { data: recentProjects = [] } =
		electronTrpc.projects.getRecents.useQuery();

	const createWorkspace = useCreateWorkspace({ skipNavigation: true });

	const addTab = useTabsStore((s) => s.addTab);
	const setTabAutoTitle = useTabsStore((s) => s.setTabAutoTitle);

	const { openNew } = useOpenProject();

	const effectiveProjectId = selectedProjectId ?? recentProjects[0]?.id ?? null;
	const selectedProject = recentProjects.find(
		(p) => p.id === effectiveProjectId,
	);

	useEffect(() => {
		if (isOpen && !selectedProjectId && recentProjects.length > 0) {
			setSelectedProjectId(recentProjects[0].id);
			localStorage.setItem("lastOpenedInProjectId", recentProjects[0].id);
		}
	}, [isOpen, selectedProjectId, recentProjects]);

	// Focus textarea when project is selected (single mode only)
	useEffect(() => {
		if (isOpen && effectiveProjectId && !isBatch) {
			const timer = setTimeout(() => textareaRef.current?.focus(), 50);
			return () => clearTimeout(timer);
		}
	}, [isOpen, effectiveProjectId, isBatch]);

	const resetForm = () => {
		setAdditionalContext("");
		setTaskStatuses({});
	};

	const handleClose = () => {
		closeModal();
		resetForm();
	};

	const handleImportRepo = async () => {
		try {
			const projects = await openNew();
			if (projects.length > 0) {
				setSelectedProjectId(projects[0].id);
				localStorage.setItem("lastOpenedInProjectId", projects[0].id);
			}
		} catch (error) {
			toast.error("Failed to open project", {
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		}
	};

	const buildCommand = (task: TaskWithStatus) => {
		return buildAgentCommand({
			task: {
				id: task.id,
				slug: task.slug,
				title: task.title,
				description: task.description,
				priority: task.priority,
				statusName: task.status?.name ?? null,
				labels: task.labels,
			},
			randomId: window.crypto.randomUUID(),
			agent: selectedAgent,
		});
	};

	const openWorkspace = async (task: TaskWithStatus, projectId: string) => {
		const branchName = deriveBranchName({
			slug: task.slug,
			title: task.title,
		});

		const result = await createWorkspace.mutateAsync({
			projectId,
			name: task.slug,
			branchName,
		});

		const command = buildCommand(task);

		if (result.wasExisting) {
			const { tabId } = addTab(result.workspace.id, {
				initialCommands: [command],
			});
			setTabAutoTitle(tabId, "Agent");
		} else {
			const store = useWorkspaceInitStore.getState();
			const pending = store.pendingTerminalSetups[result.workspace.id];
			store.addPendingTerminalSetup({
				workspaceId: result.workspace.id,
				projectId: result.projectId,
				initialCommands: pending?.initialCommands ?? null,
				defaultPresets: pending?.defaultPresets,
				agentCommand: command,
			});
		}

		return result;
	};

	const handleCreateWorkspace = async () => {
		if (!effectiveProjectId) return;

		if (isBatch) {
			await handleBatchCreate();
		} else {
			await handleSingleCreate();
		}
	};

	const handleSingleCreate = async () => {
		if (!effectiveProjectId || !singleTask) return;

		try {
			const result = await openWorkspace(singleTask, effectiveProjectId);
			handleClose();
			toast.success(
				result.wasExisting ? "Opened existing workspace" : "Workspace created",
			);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to create workspace",
			);
		}
	};

	const handleBatchCreate = async () => {
		if (!effectiveProjectId) return;

		const initialStatuses: Record<string, "pending"> = {};
		for (const task of tasks) {
			initialStatuses[task.id] = "pending";
		}
		setTaskStatuses(initialStatuses);

		let successCount = 0;
		for (const task of tasks) {
			setTaskStatuses((prev) => ({ ...prev, [task.id]: "creating" }));

			try {
				await openWorkspace(task, effectiveProjectId);
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
					description: "Launching agent for each task...",
				},
			);
		}
	};

	const isPending = createWorkspace.isPending || isBatchInProgress;

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (
			e.key === "Enter" &&
			(e.metaKey || e.ctrlKey) &&
			effectiveProjectId &&
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
							? `Create ${tasks.length} new workspaces and run an agent on each task.`
							: "Create a new workspace and run an agent on this task."}
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
									<span className="flex items-center gap-2 truncate">
										{selectedProject ? (
											<>
												<ProjectThumbnail
													projectId={selectedProject.id}
													projectName={selectedProject.name}
													projectColor={selectedProject.color}
													githubOwner={selectedProject.githubOwner}
													hideImage={selectedProject.hideImage ?? undefined}
													iconUrl={selectedProject.iconUrl}
													className="size-4"
												/>
												<span className="truncate">{selectedProject.name}</span>
											</>
										) : (
											<span className="text-muted-foreground">
												Select project
											</span>
										)}
									</span>
									<HiChevronDown className="text-muted-foreground" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="start"
								className="w-[--radix-dropdown-menu-trigger-width]"
							>
								{recentProjects.length === 0 ? (
									<DropdownMenuItem disabled>
										No projects found
									</DropdownMenuItem>
								) : (
									recentProjects
										.filter((project) => project.id)
										.map((project) => (
											<DropdownMenuItem
												key={project.id}
												onClick={() => {
													setSelectedProjectId(project.id);
													localStorage.setItem(
														"lastOpenedInProjectId",
														project.id,
													);
												}}
												className="flex items-center gap-2"
											>
												<ProjectThumbnail
													projectId={project.id}
													projectName={project.name}
													projectColor={project.color}
													githubOwner={project.githubOwner}
													hideImage={project.hideImage ?? undefined}
													iconUrl={project.iconUrl}
													className="size-4"
												/>
												{project.name}
												{project.id === effectiveProjectId && (
													<HiCheck className="ml-auto size-4" />
												)}
											</DropdownMenuItem>
										))
								)}
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={handleImportRepo}>
									<LuFolderOpen />
									Import repo
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>

					{/* Agent selector */}
					<div className="px-4 pb-3">
						<Select
							value={selectedAgent}
							onValueChange={(value: AgentType) => {
								setSelectedAgent(value);
								localStorage.setItem("lastSelectedAgent", value);
							}}
						>
							<SelectTrigger className="h-8 text-xs">
								<SelectValue placeholder="Select agent" />
							</SelectTrigger>
							<SelectContent>
								{AGENT_TYPES.map((agent) => {
									const icon = getPresetIcon(agent, isDark);
									return (
										<SelectItem key={agent} value={agent}>
											<span className="flex items-center gap-2">
												{icon && (
													<img
														src={icon}
														alt=""
														className="size-3.5 object-contain"
													/>
												)}
												{AGENT_LABELS[agent]}
											</span>
										</SelectItem>
									);
								})}
							</SelectContent>
						</Select>
					</div>

					{/* Additional context (single mode only) */}
					{effectiveProjectId && !isBatch && (
						<div className="px-4 pb-3">
							<Textarea
								ref={textareaRef}
								placeholder="Additional context or instructions (optional)"
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
						disabled={!effectiveProjectId || isPending}
					>
						{isBatchInProgress
							? `Creating... (${Object.values(taskStatuses).filter((s) => s === "done" || s === "failed").length}/${tasks.length})`
							: createWorkspace.isPending
								? "Creating..."
								: isBatch
									? `Create ${tasks.length} Workspaces & Start Agent`
									: "Create Workspace & Start Agent"}
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
