"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTRPC } from "@/trpc/react";
import { CreateTaskForm } from "./components/CreateTaskForm";
import { EditTaskDialog } from "./components/EditTaskDialog";
import { StatusGroup } from "./components/StatusGroup";
import { TaskRow } from "./components/TaskRow";

// Same test org ID as the Linear test page
const TEST_ORG_ID = "00000000-0000-0000-0000-000000000000";

interface Task {
	id: string;
	slug: string;
	title: string;
	description?: string | null;
	status: string;
	statusColor: string | null;
	statusType: string | null;
	statusPosition: number | null;
	priority: "urgent" | "high" | "medium" | "low" | "none";
	externalKey: string | null;
	labels: string[] | null;
	estimate: number | null;
	createdAt: Date;
	organizationId: string;
	assignee?: {
		id: string;
		name: string;
		avatarUrl: string | null;
	} | null;
}

export default function TasksPage() {
	const trpc = useTRPC();
	const [editingTask, setEditingTask] = useState<Task | null>(null);

	const tasksQuery = useQuery({
		...trpc.task.byOrganization.queryOptions(TEST_ORG_ID),
		refetchInterval: 5000, // Poll every 5 seconds for Linear changes
	});

	// Group tasks by status, ordered by statusPosition
	const groupedTasks = useMemo(() => {
		if (!tasksQuery.data) return [];

		const tasks = tasksQuery.data as Task[];
		const groups = new Map<
			string,
			{ tasks: Task[]; color: string | null; position: number }
		>();

		for (const task of tasks) {
			const existing = groups.get(task.status);
			if (existing) {
				existing.tasks.push(task);
			} else {
				groups.set(task.status, {
					tasks: [task],
					color: task.statusColor,
					position: task.statusPosition ?? 999,
				});
			}
		}

		// Sort groups by position (lower = earlier in workflow)
		return [...groups.entries()].sort(
			([, a], [, b]) => a.position - b.position,
		);
	}, [tasksQuery.data]);

	if (tasksQuery.isLoading) {
		return (
			<div className="flex h-screen items-center justify-center">
				<Loader2 className="text-muted-foreground size-8 animate-spin" />
			</div>
		);
	}

	if (tasksQuery.isError) {
		return (
			<div className="flex h-screen items-center justify-center">
				<p className="text-red-500">Error: {tasksQuery.error.message}</p>
			</div>
		);
	}

	const totalTasks = tasksQuery.data?.length ?? 0;

	return (
		<div className="bg-background min-h-screen">
			{/* Header */}
			<div className="flex items-center justify-between border-b px-4 py-3">
				<div>
					<h1 className="text-lg font-semibold">Issues</h1>
					<p className="text-muted-foreground text-sm">
						{totalTasks} issues synced from Linear
					</p>
				</div>
				<CreateTaskForm organizationId={TEST_ORG_ID} />
			</div>

			{/* Task List */}
			<div className="divide-y">
				{groupedTasks.length === 0 ? (
					<div className="text-muted-foreground py-12 text-center">
						No tasks found. Sync issues from the{" "}
						<a href="/test/linear" className="text-primary underline">
							Linear integration page
						</a>
						.
					</div>
				) : (
					groupedTasks.map(([status, { tasks, color }]) => (
						<StatusGroup
							key={status}
							status={status}
							statusColor={color}
							count={tasks.length}
						>
							{tasks.map((task) => (
								<TaskRow
									key={task.id}
									task={task}
									onClick={() => setEditingTask(task)}
								/>
							))}
						</StatusGroup>
					))
				)}
			</div>

			{/* Edit Dialog */}
			<EditTaskDialog
				task={editingTask}
				onClose={() => setEditingTask(null)}
				organizationId={TEST_ORG_ID}
			/>
		</div>
	);
}
