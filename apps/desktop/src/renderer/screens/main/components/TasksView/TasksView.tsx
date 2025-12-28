import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@superset/ui/card";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { ScrollArea } from "@superset/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import {
	HiCalendar,
	HiCheckCircle,
	HiInbox,
	HiLink,
	HiPencil,
	HiUser,
} from "react-icons/hi2";
import { OrganizationsProvider } from "renderer/contexts/OrganizationsProvider";
import {
	PGliteProvider,
	type SelectTask,
	type TaskPriority,
	useTasks,
} from "renderer/lib/pglite";
import { trpc } from "renderer/lib/trpc";
import { OrganizationSwitcher } from "./components/OrganizationSwitcher";

type Task = SelectTask;

interface TaskEditDialogProps {
	task: Task;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

function TaskEditDialog({ task, open, onOpenChange }: TaskEditDialogProps) {
	const [title, setTitle] = useState(task.title);
	const [description, setDescription] = useState(task.description || "");
	const [priority, setPriority] = useState(task.priority);
	const [isSaving, setIsSaving] = useState(false);

	const updateTask = trpc.tasks.update.useMutation({
		onSuccess: () => {
			onOpenChange(false);
		},
		onSettled: () => {
			setIsSaving(false);
		},
	});

	const handleSave = () => {
		setIsSaving(true);
		updateTask.mutate({
			id: task.id,
			title,
			description: description || null,
			priority: priority as "urgent" | "high" | "medium" | "low" | "none",
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{task.external_key && (
							<Badge variant="outline" className="text-xs">
								{task.external_key}
							</Badge>
						)}
						Edit Task
					</DialogTitle>
				</DialogHeader>
				<div className="grid gap-4 py-4">
					<div className="grid gap-2">
						<Label htmlFor="title">Title</Label>
						<Input
							id="title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="description">Description</Label>
						<Textarea
							id="description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={4}
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
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={isSaving || !title.trim()}>
						{isSaving ? "Saving..." : "Save & Sync to Linear"}
					</Button>
				</DialogFooter>
				{updateTask.error && (
					<p className="text-sm text-destructive mt-2">
						Error: {updateTask.error.message}
					</p>
				)}
			</DialogContent>
		</Dialog>
	);
}

function TaskCard({
	task,
	onEdit,
}: {
	task: Task;
	onEdit: (task: Task) => void;
}) {
	const priorityColors: Record<string, string> = {
		urgent: "bg-red-500",
		high: "bg-orange-500",
		medium: "bg-yellow-500",
		low: "bg-blue-500",
		none: "bg-gray-400",
	};

	const statusColors: Record<string, string> = {
		backlog: "bg-gray-400",
		todo: "bg-blue-400",
		planning: "bg-purple-400",
		working: "bg-yellow-400",
		"needs-feedback": "bg-orange-400",
		"ready-to-merge": "bg-green-400",
		completed: "bg-green-600",
		canceled: "bg-red-400",
	};

	return (
		<Card className="hover:bg-muted/50 transition-colors group">
			<CardHeader className="pb-2">
				<div className="flex items-start justify-between gap-2">
					<div className="flex items-center gap-2 min-w-0">
						{task.external_key && (
							<Badge variant="outline" className="shrink-0 text-xs">
								{task.external_key}
							</Badge>
						)}
						<CardTitle className="text-sm font-medium truncate">
							{task.title}
						</CardTitle>
					</div>
					<div className="flex items-center gap-1.5 shrink-0">
						<Button
							variant="ghost"
							size="icon"
							className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
							onClick={() => onEdit(task)}
						>
							<HiPencil className="h-3 w-3" />
						</Button>
						{task.priority !== "none" && (
							<div
								className={`h-2 w-2 rounded-full ${priorityColors[task.priority] || "bg-gray-400"}`}
								title={`Priority: ${task.priority}`}
							/>
						)}
						<Badge
							variant="secondary"
							className={`text-xs text-white ${statusColors[task.status] || (task.status_color ? "" : "bg-gray-400")}`}
							style={
								task.status_color
									? { backgroundColor: task.status_color }
									: undefined
							}
						>
							{task.status}
						</Badge>
					</div>
				</div>
			</CardHeader>
			<CardContent className="pt-0">
				{task.description && (
					<p className="text-xs text-muted-foreground line-clamp-2 mb-2">
						{task.description}
					</p>
				)}
				<div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
					{task.assignee_id && (
						<span className="flex items-center gap-1">
							<HiUser className="h-3 w-3" />
							Assigned
						</span>
					)}
					{task.due_date && (
						<span className="flex items-center gap-1">
							<HiCalendar className="h-3 w-3" />
							{new Date(task.due_date).toLocaleDateString()}
						</span>
					)}
					{task.branch && (
						<span className="flex items-center gap-1 font-mono">
							{task.branch}
						</span>
					)}
					{task.external_url && (
						<a
							href={task.external_url}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-1 hover:text-foreground"
						>
							<HiLink className="h-3 w-3" />
							{task.external_provider || "Link"}
						</a>
					)}
				</div>
				{task.labels && task.labels.length > 0 && (
					<div className="flex flex-wrap gap-1 mt-2">
						{(task.labels as string[]).map((label) => (
							<Badge key={label} variant="outline" className="text-xs">
								{label}
							</Badge>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

function TasksList() {
	const [editingTask, setEditingTask] = useState<Task | null>(null);

	const result = useTasks();
	const tasks = result?.rows ?? [];

	if (tasks.length === 0) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="flex flex-col items-center gap-2 text-muted-foreground">
					<HiCheckCircle className="h-8 w-8" />
					<span className="text-sm">No tasks found</span>
				</div>
			</div>
		);
	}

	return (
		<>
			<div className="grid gap-3 p-4">
				{tasks.map((task) => (
					<TaskCard key={task.id} task={task} onEdit={setEditingTask} />
				))}
			</div>
			{editingTask && (
				<TaskEditDialog
					task={editingTask}
					open={!!editingTask}
					onOpenChange={(open) => !open && setEditingTask(null)}
				/>
			)}
		</>
	);
}

function Sidebar() {
	return (
		<div className="w-56 border-r bg-muted/30 flex flex-col">
			<div className="p-2 border-b">
				<OrganizationSwitcher />
			</div>
			<nav className="flex-1 p-2">
				<button
					type="button"
					className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md bg-muted text-sm font-medium"
				>
					<HiInbox className="h-4 w-4" />
					All Tasks
				</button>
			</nav>
		</div>
	);
}

function TasksViewContent() {
	return (
		<div className="flex flex-1 min-h-0 bg-background">
			<Sidebar />
			<div className="flex-1 flex flex-col min-h-0">
				<div className="border-b px-4 py-3 shrink-0">
					<h1 className="text-lg font-semibold">Tasks</h1>
				</div>
				<ScrollArea className="flex-1 min-h-0">
					<TasksList />
				</ScrollArea>
			</div>
		</div>
	);
}

export function TasksView() {
	return (
		<OrganizationsProvider>
			<PGliteProvider>
				<TasksViewContent />
			</PGliteProvider>
		</OrganizationsProvider>
	);
}
