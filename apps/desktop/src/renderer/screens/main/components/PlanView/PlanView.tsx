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
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Textarea } from "@superset/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useState } from "react";
import {
	LuArrowLeft,
	LuGripVertical,
	LuLoader,
	LuPause,
	LuPlay,
	LuPlus,
	LuSquare,
	LuTrash2,
} from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import { useClosePlan } from "renderer/stores/app-state";

type PlanTaskStatus = "backlog" | "queued" | "running" | "completed" | "failed";
type TaskPriority = "urgent" | "high" | "medium" | "low" | "none";

interface PlanTask {
	id: string;
	planId: string;
	title: string;
	description: string | null;
	status: PlanTaskStatus;
	priority: TaskPriority | null;
	columnOrder: number;
	externalProvider: string | null;
	externalId: string | null;
	externalUrl: string | null;
	executionStatus: string | null;
	createdAt: number;
	updatedAt: number;
}

const COLUMN_CONFIG: {
	status: PlanTaskStatus;
	title: string;
	color: string;
}[] = [
	{ status: "backlog", title: "Backlog", color: "bg-muted" },
	{ status: "queued", title: "Queued", color: "bg-yellow-500" },
	{ status: "running", title: "Running", color: "bg-blue-500" },
	{ status: "completed", title: "Completed", color: "bg-green-500" },
	{ status: "failed", title: "Failed", color: "bg-red-500" },
];

export function PlanView() {
	const closePlan = useClosePlan();
	const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);

	// Get active workspace to determine the project
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const projectId = activeWorkspace?.project?.id;

	// Get or create plan for the project
	const { data: plan, refetch: refetchPlan } =
		trpc.plan.getActiveByProject.useQuery(
			{ projectId: projectId! },
			{ enabled: !!projectId },
		);

	const createPlanMutation = trpc.plan.create.useMutation({
		onSuccess: () => refetchPlan(),
	});

	// Auto-create plan if none exists
	useEffect(() => {
		if (projectId && plan === null && !createPlanMutation.isPending) {
			createPlanMutation.mutate({ projectId });
		}
	}, [projectId, plan, createPlanMutation]);

	// Get tasks for the plan
	const { data: tasksData, refetch: refetchTasks } =
		trpc.plan.getTasksByPlan.useQuery(
			{ planId: plan?.id! },
			{ enabled: !!plan?.id },
		);

	const createTaskMutation = trpc.plan.createTask.useMutation({
		onSuccess: () => {
			refetchTasks();
			setIsCreateTaskOpen(false);
		},
	});

	const moveTaskMutation = trpc.plan.moveTask.useMutation({
		onSuccess: () => refetchTasks(),
	});

	const deleteTaskMutation = trpc.plan.deleteTask.useMutation({
		onSuccess: () => refetchTasks(),
	});

	const startTaskMutation = trpc.plan.start.useMutation({
		onSuccess: () => refetchTasks(),
	});

	const stopTaskMutation = trpc.plan.stop.useMutation({
		onSuccess: () => refetchTasks(),
	});

	const handleCreateTask = useCallback(
		(data: { title: string; description?: string; priority?: TaskPriority }) => {
			if (!plan?.id) return;
			createTaskMutation.mutate({
				planId: plan.id,
				title: data.title,
				description: data.description,
				priority: data.priority,
			});
		},
		[plan?.id, createTaskMutation],
	);

	const handleMoveTask = useCallback(
		(taskId: string, status: PlanTaskStatus, columnOrder: number) => {
			moveTaskMutation.mutate({ id: taskId, status, columnOrder });
		},
		[moveTaskMutation],
	);

	const handleDeleteTask = useCallback(
		(taskId: string) => {
			deleteTaskMutation.mutate({ id: taskId });
		},
		[deleteTaskMutation],
	);

	const handleStartTask = useCallback(
		(taskId: string) => {
			startTaskMutation.mutate({ taskId });
		},
		[startTaskMutation],
	);

	const handleStopTask = useCallback(
		(taskId: string) => {
			stopTaskMutation.mutate({ taskId });
		},
		[stopTaskMutation],
	);

	if (!activeWorkspace?.project) {
		return (
			<div className="flex flex-col h-full w-full bg-background items-center justify-center">
				<p className="text-muted-foreground">
					Open a workspace to use the Plan view
				</p>
				<Button variant="outline" onClick={closePlan} className="mt-4">
					Go Back
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full w-full overflow-hidden bg-background">
			{/* Header */}
			<div className="flex-shrink-0 flex items-center justify-between border-b border-border px-4 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
				<div className="flex items-center gap-3">
					<Button
						variant="ghost"
						size="icon"
						onClick={closePlan}
						className="size-8"
					>
						<LuArrowLeft className="size-4" />
					</Button>
					<div>
						<h1 className="text-lg font-semibold">Plan</h1>
						<p className="text-xs text-muted-foreground">
							{activeWorkspace.project.name}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Button
						size="sm"
						className="gap-2"
						onClick={() => setIsCreateTaskOpen(true)}
					>
						<LuPlus className="size-4" />
						Add Task
					</Button>
				</div>
			</div>

			{/* Main content area - split between kanban and chat */}
			<div className="flex-1 min-h-0 overflow-hidden">
				<ResizablePanelGroup direction="horizontal" className="h-full">
					{/* Kanban Board Panel */}
					<ResizablePanel defaultSize={70} minSize={30}>
						<div className="h-full overflow-hidden">
							<KanbanBoard
								tasks={tasksData?.tasks ?? []}
								onMoveTask={handleMoveTask}
								onDeleteTask={handleDeleteTask}
								onStartTask={handleStartTask}
								onStopTask={handleStopTask}
							/>
						</div>
					</ResizablePanel>

					<ResizableHandle withHandle className="bg-border/50 hover:bg-border transition-colors" />

					{/* Orchestration Chat Panel */}
					<ResizablePanel defaultSize={30} minSize={15}>
						<div className="h-full overflow-hidden bg-muted/20">
							<ChatPlaceholder />
						</div>
					</ResizablePanel>
				</ResizablePanelGroup>
			</div>

			{/* Create Task Dialog */}
			<CreateTaskDialog
				open={isCreateTaskOpen}
				onOpenChange={setIsCreateTaskOpen}
				onSubmit={handleCreateTask}
				isLoading={createTaskMutation.isPending}
			/>
		</div>
	);
}

interface KanbanBoardProps {
	tasks: PlanTask[];
	onMoveTask: (taskId: string, status: PlanTaskStatus, columnOrder: number) => void;
	onDeleteTask: (taskId: string) => void;
	onStartTask: (taskId: string) => void;
	onStopTask: (taskId: string) => void;
}

function KanbanBoard({ tasks, onMoveTask, onDeleteTask, onStartTask, onStopTask }: KanbanBoardProps) {
	// Group tasks by status
	const groupedTasks: Record<PlanTaskStatus, PlanTask[]> = {
		backlog: [],
		queued: [],
		running: [],
		completed: [],
		failed: [],
	};

	for (const task of tasks) {
		const status = task.status as PlanTaskStatus;
		groupedTasks[status].push(task);
	}

	// Sort each column by columnOrder
	for (const status of Object.keys(groupedTasks) as PlanTaskStatus[]) {
		groupedTasks[status].sort((a, b) => a.columnOrder - b.columnOrder);
	}

	return (
		<div className="h-full p-3 overflow-x-auto">
			<div className="flex gap-3 h-full">
				{COLUMN_CONFIG.map((column) => (
					<KanbanColumn
						key={column.status}
						status={column.status}
						title={column.title}
						color={column.color}
						tasks={groupedTasks[column.status]}
						onMoveTask={onMoveTask}
						onDeleteTask={onDeleteTask}
						onStartTask={onStartTask}
						onStopTask={onStopTask}
					/>
				))}
			</div>
		</div>
	);
}

interface KanbanColumnProps {
	status: PlanTaskStatus;
	title: string;
	color: string;
	tasks: PlanTask[];
	onMoveTask: (taskId: string, status: PlanTaskStatus, columnOrder: number) => void;
	onDeleteTask: (taskId: string) => void;
	onStartTask: (taskId: string) => void;
	onStopTask: (taskId: string) => void;
}

function KanbanColumn({
	status,
	title,
	color,
	tasks,
	onMoveTask,
	onDeleteTask,
	onStartTask,
	onStopTask,
}: KanbanColumnProps) {
	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		const taskId = e.dataTransfer.getData("text/plain");
		if (taskId) {
			onMoveTask(taskId, status, tasks.length);
		}
	};

	return (
		<div
			className="flex flex-col flex-shrink-0 w-56 bg-muted/20 rounded-lg border border-border/50"
			onDragOver={handleDragOver}
			onDrop={handleDrop}
		>
			<div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50">
				<div className={cn("size-2.5 rounded-full", color)} />
				<span className="text-sm font-medium">{title}</span>
				<span className="text-xs text-muted-foreground ml-auto bg-muted/50 px-1.5 py-0.5 rounded">
					{tasks.length}
				</span>
			</div>
			<div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[120px]">
				{tasks.length === 0 ? (
					<div className="flex items-center justify-center h-24 border border-dashed border-muted-foreground/20 rounded-md text-muted-foreground text-xs">
						Drop tasks here
					</div>
				) : (
					tasks.map((task) => (
						<TaskCard
							key={task.id}
							task={task}
							onDelete={() => onDeleteTask(task.id)}
							onStart={() => onStartTask(task.id)}
							onStop={() => onStopTask(task.id)}
						/>
					))
				)}
			</div>
		</div>
	);
}

interface TaskCardProps {
	task: PlanTask;
	onDelete: () => void;
	onStart: () => void;
	onStop: () => void;
}

function TaskCard({ task, onDelete, onStart, onStop }: TaskCardProps) {
	const handleDragStart = (e: React.DragEvent) => {
		e.dataTransfer.setData("text/plain", task.id);
		e.dataTransfer.effectAllowed = "move";
	};

	const priorityColors: Record<string, string> = {
		urgent: "bg-red-500",
		high: "bg-orange-500",
		medium: "bg-yellow-500",
		low: "bg-blue-500",
		none: "bg-muted",
	};

	const isRunning = task.status === "running";
	const isQueued = task.status === "queued";
	const canStart = task.status === "backlog" || task.status === "failed";
	const canStop = isRunning || isQueued;

	return (
		<TooltipProvider>
			<div
				draggable
				onDragStart={handleDragStart}
				className="group bg-background border border-border/80 rounded-md p-2.5 cursor-grab active:cursor-grabbing hover:border-foreground/20 hover:shadow-sm transition-all"
			>
				<div className="flex items-start gap-1.5">
					<LuGripVertical className="size-3.5 text-muted-foreground mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-1.5">
							{task.priority && (
								<div
									className={cn(
										"size-1.5 rounded-full flex-shrink-0",
										priorityColors[task.priority] ?? "bg-muted",
									)}
									title={`Priority: ${task.priority}`}
								/>
							)}
							<span className="text-xs font-medium truncate">{task.title}</span>
							{isRunning && (
								<LuLoader className="size-3 text-blue-500 animate-spin flex-shrink-0" />
							)}
						</div>
						{task.description && (
							<p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
								{task.description}
							</p>
						)}
						{task.externalUrl && (
							<a
								href={task.externalUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="text-[11px] text-blue-500 hover:underline mt-1 block"
								onClick={(e) => e.stopPropagation()}
							>
								View in Linear
							</a>
						)}
						{task.executionStatus && (
							<span className="text-[10px] text-muted-foreground mt-1 block capitalize">
								{task.executionStatus}
							</span>
						)}
					</div>
					<div className="flex items-center gap-0.5 flex-shrink-0">
						{canStart && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-5 opacity-0 group-hover:opacity-100 transition-opacity text-green-500 hover:text-green-600 hover:bg-green-500/10"
										onClick={(e) => {
											e.stopPropagation();
											onStart();
										}}
									>
										<LuPlay className="size-2.5" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top" className="text-xs">Start</TooltipContent>
							</Tooltip>
						)}
						{canStop && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-5 text-red-500 hover:text-red-600 hover:bg-red-500/10"
										onClick={(e) => {
											e.stopPropagation();
											onStop();
										}}
									>
										<LuSquare className="size-2.5" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top" className="text-xs">Stop</TooltipContent>
							</Tooltip>
						)}
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="size-5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
									onClick={(e) => {
										e.stopPropagation();
										onDelete();
									}}
								>
									<LuTrash2 className="size-2.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top" className="text-xs">Delete</TooltipContent>
						</Tooltip>
					</div>
				</div>
			</div>
		</TooltipProvider>
	);
}

interface CreateTaskDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (data: {
		title: string;
		description?: string;
		priority?: TaskPriority;
	}) => void;
	isLoading: boolean;
}

function CreateTaskDialog({
	open,
	onOpenChange,
	onSubmit,
	isLoading,
}: CreateTaskDialogProps) {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [priority, setPriority] = useState<TaskPriority>("medium");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!title.trim()) return;
		onSubmit({
			title: title.trim(),
			description: description.trim() || undefined,
			priority,
		});
		setTitle("");
		setDescription("");
		setPriority("medium");
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Create Task</DialogTitle>
						<DialogDescription>
							Add a new task to the backlog. You can drag it to other columns
							later.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="grid gap-2">
							<Label htmlFor="title">Title</Label>
							<Input
								id="title"
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="Task title"
								autoFocus
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="description">Description (optional)</Label>
							<Textarea
								id="description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="Task description"
								rows={3}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="priority">Priority</Label>
							<Select
								value={priority}
								onValueChange={(v) => setPriority(v as TaskPriority)}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="urgent">Urgent</SelectItem>
									<SelectItem value="high">High</SelectItem>
									<SelectItem value="medium">Medium</SelectItem>
									<SelectItem value="low">Low</SelectItem>
									<SelectItem value="none">None</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={!title.trim() || isLoading}>
							{isLoading && <LuLoader className="size-4 animate-spin mr-2" />}
							Create Task
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function ChatPlaceholder() {
	return (
		<div className="flex flex-col h-full overflow-hidden">
			{/* Chat header */}
			<div className="flex-shrink-0 flex items-center px-3 py-2.5 border-b border-border/50">
				<h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Orchestrator</h2>
			</div>

			{/* Chat messages */}
			<div className="flex-1 overflow-y-auto p-3 min-h-0">
				<div className="flex items-center justify-center h-full text-muted-foreground">
					<div className="text-center space-y-1.5 px-2">
						<p className="text-xs">Start a conversation to orchestrate your tasks.</p>
						<p className="text-[11px] text-muted-foreground/70">
							Create, modify, and run tasks with AI.
						</p>
					</div>
				</div>
			</div>

			{/* Chat input */}
			<div className="flex-shrink-0 border-t border-border/50 p-2">
				<div className="flex gap-1.5">
					<Input
						type="text"
						placeholder="Ask the orchestrator..."
						className="flex-1 h-8 text-xs"
						disabled
					/>
					<Button size="sm" className="h-8 px-3 flex-shrink-0" disabled>
						Send
					</Button>
				</div>
			</div>
		</div>
	);
}
