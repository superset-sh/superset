import type { TaskPriority } from "@superset/db/enums";
import type { SelectTask } from "@superset/db/schema";
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
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useLiveQuery } from "@tanstack/react-db";
import { useState } from "react";
import {
	HiCalendar,
	HiCheckCircle,
	HiInbox,
	HiLink,
	HiPencil,
	HiUser,
} from "react-icons/hi2";
import {
	ActiveOrganizationProvider,
	CollectionsProvider,
	OrganizationsProvider,
	useActiveOrganization,
	useCollections,
} from "renderer/contexts";
import { OrganizationSwitcher } from "./components/OrganizationSwitcher";

interface TaskEditDialogProps {
	task: SelectTask;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

function TaskEditDialog({ task, open, onOpenChange }: TaskEditDialogProps) {
	const [title, setTitle] = useState(task.title);
	const [description, setDescription] = useState(task.description || "");
	const [priority, setPriority] = useState(task.priority);
	const [isSaving, setIsSaving] = useState(false);
	const { tasks: tasksCollection } = useCollections();

	const handleSave = async () => {
		setIsSaving(true);
		try {
			// Use collection's update method - this triggers onUpdate handler
			// which sends the mutation to the API
			await tasksCollection.update(task.id, (draft) => {
				draft.title = title;
				draft.description = description || null;
				draft.priority = priority as
					| "urgent"
					| "high"
					| "medium"
					| "low"
					| "none";
			});
			toast.success("Task updated");
			onOpenChange(false);
		} catch (error) {
			console.error("[TaskEditDialog] Update failed:", error);
			toast.error(
				`Failed to update task: ${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						{task.externalKey && (
							<Badge variant="outline" className="text-xs">
								{task.externalKey}
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
			</DialogContent>
		</Dialog>
	);
}

function TaskCard({
	task,
	onEdit,
}: {
	task: SelectTask;
	onEdit: (task: SelectTask) => void;
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
						{task.externalKey && (
							<Badge variant="outline" className="shrink-0 text-xs">
								{task.externalKey}
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
							className={`text-xs text-white ${statusColors[task.status] || (task.statusColor ? "" : "bg-gray-400")}`}
							style={
								task.statusColor
									? { backgroundColor: task.statusColor }
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
					{task.assigneeId && (
						<span className="flex items-center gap-1">
							<HiUser className="h-3 w-3" />
							Assigned
						</span>
					)}
					{task.dueDate && (
						<span className="flex items-center gap-1">
							<HiCalendar className="h-3 w-3" />
							{new Date(task.dueDate).toLocaleDateString()}
						</span>
					)}
					{task.branch && (
						<span className="flex items-center gap-1 font-mono">
							{task.branch}
						</span>
					)}
					{task.externalUrl && (
						<a
							href={task.externalUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-1 hover:text-foreground"
						>
							<HiLink className="h-3 w-3" />
							{task.externalProvider || "Link"}
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
	const [editingTask, setEditingTask] = useState<SelectTask | null>(null);
	const { tasks: tasksCollection } = useCollections();
	const { activeOrganizationId } = useActiveOrganization();

	// Query all task objects from collection
	// Include tasksCollection and activeOrganizationId in deps to force re-query when they change
	const { data: allTasks, isLoading } = useLiveQuery(
		(q) => q.from({ tasks: tasksCollection }),
		[tasksCollection, activeOrganizationId],
	);

	// Filter out deleted tasks in JavaScript
	const tasks = (allTasks?.filter((task) => task.deletedAt === null) ||
		[]) as SelectTask[];

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
			</div>
		);
	}

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
			<ActiveOrganizationProvider>
				<CollectionsProvider>
					<TasksViewContent />
				</CollectionsProvider>
			</ActiveOrganizationProvider>
		</OrganizationsProvider>
	);
}
