import { useEffect, useState } from "react";
import type { Worktree } from "shared/types";
import type { Task } from "./types";
import { transformWorktreeToTask } from "./utils";

export function useTaskData(
	isOpen: boolean,
	mode: "list" | "new",
	workspaceId: string | null,
) {
	const [tasks, setTasks] = useState<Task[]>([]);
	const [isLoadingTasks, setIsLoadingTasks] = useState(false);
	const [tasksError, setTasksError] = useState<string | null>(null);

	// Fetch tasks when modal opens
	useEffect(() => {
		if (!isOpen || mode !== "list" || !workspaceId) {
			setTasks([]);
			return;
		}

		let cancelled = false;
		setIsLoadingTasks(true);
		setTasksError(null);

		const fetchTasks = async () => {
			try {
				// Fetch workspace from config via IPC
				const workspace = await window.ipcRenderer.invoke(
					"workspace-get",
					workspaceId,
				);

				if (!workspace) {
					throw new Error("Workspace not found");
				}

				if (!cancelled) {
					// Transform worktrees to tasks
					const transformedTasks = workspace.worktrees.map(transformWorktreeToTask);
					setTasks(transformedTasks);
					setTasksError(null);
				}
			} catch (error) {
				if (!cancelled) {
					console.error("Failed to fetch tasks:", error);
					setTasksError(
						error instanceof Error
							? error.message
							: "Failed to load tasks from workspace.",
					);
					setTasks([]);
				}
			} finally {
				if (!cancelled) {
					setIsLoadingTasks(false);
				}
			}
		};

		void fetchTasks();

		return () => {
			cancelled = true;
		};
	}, [isOpen, mode, workspaceId]);

	return { tasks, isLoadingTasks, tasksError };
}

