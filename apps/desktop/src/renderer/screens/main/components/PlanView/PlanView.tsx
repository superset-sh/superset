import type { RouterOutputs } from "@superset/api";
import { Plus } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { useWorkspaceContext, useTabContext } from "../../../../contexts";
import { mockTasks, mockUsers } from "../../../../../lib/mock-data";
import { CreateTaskModal } from "./CreateTaskModal";
import { KanbanColumn } from "./KanbanColumn";
import { TaskPage } from "./TaskPage";

type Task = RouterOutputs["task"]["all"][number];
type User = RouterOutputs["user"]["all"][number];

interface PlanViewProps {}

export const PlanView: React.FC<PlanViewProps> = () => {
	const { currentWorkspace } = useWorkspaceContext();
	const { selectedWorktreeId, handleTabSelect, handleTabCreated } = useTabContext();
	// Initialize with mock tasks and add some variety to statuses
	const [tasks, setTasks] = useState<Task[]>(() => {
		// Modify some tasks to have different statuses for demo purposes
		return mockTasks.map((task: Task, index: number) => {
			if (index === 0 || index === 1)
				return { ...task, status: "todo" as const };
			if (index === 2 || index === 3)
				return { ...task, status: "planning" as const };
			if (index === 4) return { ...task, status: "needs-feedback" as const };
			if (index === 5) return { ...task, status: "completed" as const };
			return task;
		});
	});

	const [viewingTask, setViewingTask] = useState<Task | null>(null);
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

	// Group tasks by status
	const tasksByStatus = useMemo(() => {
		return {
			backlog: tasks.filter((t) => t.status === "backlog"),
			todo: tasks.filter((t) => t.status === "todo"),
			planning: tasks.filter((t) => t.status === "planning"),
			"needs-feedback": tasks.filter((t) => t.status === "needs-feedback"),
			completed: tasks.filter((t) => t.status === "completed"),
		};
	}, [tasks]);

	const handleCreateTask = (taskData: {
		title: string;
		description: string;
		status: Task["status"];
	}) => {
		const newTask: Task = {
			id: `temp-${Date.now()}`,
			slug: `SUPER-${tasks.length + 1}`,
			title: taskData.title,
			description: taskData.description,
			status: taskData.status,
			repositoryId: mockTasks[0].repositoryId,
			organizationId: mockTasks[0].organizationId,
			assigneeId: null,
			creatorId: mockTasks[0].creatorId,
			branch: null,
			createdAt: new Date(),
			updatedAt: new Date(),
			assignee: null,
			creator: mockTasks[0].creator,
		};

		setTasks([...tasks, newTask]);
	};

	const handleUpdateTask = (
		taskId: string,
		updates: {
			title: string;
			description: string;
			status: Task["status"];
			assigneeId?: string | null;
		},
	) => {
		setTasks(
			tasks.map((task) => {
				if (task.id === taskId) {
					const updatedTask = {
						...task,
						title: updates.title,
						description: updates.description,
						status: updates.status,
						updatedAt: new Date(),
					};

					// Update assignee if assigneeId is provided
					if (updates.assigneeId !== undefined) {
						updatedTask.assigneeId = updates.assigneeId;
						updatedTask.assignee = updates.assigneeId
							? mockUsers.find((u) => u.id === updates.assigneeId) || null
							: null;
					}

					return updatedTask;
				}
				return task;
			}),
		);

		// Update viewingTask if it's the one being edited
		if (viewingTask?.id === taskId) {
			const updatedViewingTask = {
				...viewingTask,
				title: updates.title,
				description: updates.description,
				status: updates.status,
				updatedAt: new Date(),
			};

			// Update assignee if assigneeId is provided
			if (updates.assigneeId !== undefined) {
				updatedViewingTask.assigneeId = updates.assigneeId;
				updatedViewingTask.assignee = updates.assigneeId
					? mockUsers.find((u) => u.id === updates.assigneeId) || null
					: null;
			}

			setViewingTask(updatedViewingTask);
		}
	};

	// If viewing a task, show the task page
	if (viewingTask) {
		return (
			<TaskPage
				task={viewingTask}
				users={mockUsers}
				onBack={() => setViewingTask(null)}
				onUpdate={handleUpdateTask}
				currentWorkspace={currentWorkspace}
				selectedWorktreeId={selectedWorktreeId}
				onTabSelect={handleTabSelect}
				onTabCreated={handleTabCreated}
			/>
		);
	}

	// Otherwise, show the kanban board
	return (
		<div className="flex flex-col h-full bg-neutral-950">
			{/* Header */}
			<div className="flex items-center justify-between px-8 py-5 border-b border-neutral-800/50 backdrop-blur-sm bg-neutral-950/80">
				<div>
					<h1 className="text-base font-semibold text-white tracking-tight">
						Plan View
					</h1>
					<p className="text-xs text-neutral-500 mt-1">
						Manage and organize your tasks
					</p>
				</div>
				<button
					type="button"
					onClick={() => setIsCreateModalOpen(true)}
					className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-700/80 hover:bg-neutral-700 text-white text-sm font-medium rounded-lg transition-all shadow-sm hover:shadow-md"
				>
					<Plus size={16} strokeWidth={2.5} />
					<span>New Task</span>
				</button>
			</div>

			{/* Kanban Board */}
			<div className="flex-1 overflow-x-auto overflow-y-hidden bg-gradient-to-b from-neutral-950 to-neutral-950/95">
				<div className="flex gap-5 p-8 h-full">
					<KanbanColumn
						title="Backlog"
						tasks={tasksByStatus.backlog}
						onTaskClick={setViewingTask}
						statusColor="bg-neutral-500"
						currentWorkspace={currentWorkspace}
						selectedWorktreeId={selectedWorktreeId}
						onTabSelect={onTabSelect}
						onTabCreated={onTabCreated}
						onUpdateTask={handleUpdateTask}
					/>
					<KanbanColumn
						title="Todo"
						tasks={tasksByStatus.todo}
						onTaskClick={setViewingTask}
						statusColor="bg-blue-500"
						currentWorkspace={currentWorkspace}
						selectedWorktreeId={selectedWorktreeId}
						onTabSelect={onTabSelect}
						onTabCreated={onTabCreated}
						onUpdateTask={handleUpdateTask}
					/>
					<KanbanColumn
						title="Pending"
						tasks={tasksByStatus.planning}
						onTaskClick={setViewingTask}
						statusColor="bg-yellow-500"
						currentWorkspace={currentWorkspace}
						selectedWorktreeId={selectedWorktreeId}
						onTabSelect={onTabSelect}
						onTabCreated={onTabCreated}
						onUpdateTask={handleUpdateTask}
					/>
					<KanbanColumn
						title="Needs Feedback"
						tasks={tasksByStatus["needs-feedback"]}
						onTaskClick={setViewingTask}
						statusColor="bg-orange-500"
						currentWorkspace={currentWorkspace}
						selectedWorktreeId={selectedWorktreeId}
						onTabSelect={onTabSelect}
						onTabCreated={onTabCreated}
						onUpdateTask={handleUpdateTask}
					/>
					<KanbanColumn
						title="Completed"
						tasks={tasksByStatus.completed}
						onTaskClick={setViewingTask}
						statusColor="bg-green-600"
						currentWorkspace={currentWorkspace}
						selectedWorktreeId={selectedWorktreeId}
						onTabSelect={onTabSelect}
						onTabCreated={onTabCreated}
						onUpdateTask={handleUpdateTask}
					/>
				</div>
			</div>

			{/* Create Task Modal */}
			<CreateTaskModal
				isOpen={isCreateModalOpen}
				onClose={() => setIsCreateModalOpen(false)}
				onCreate={handleCreateTask}
			/>
		</div>
	);
};
