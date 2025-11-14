import { useCallback, useEffect, useRef, useState } from "react";
import type { Worktree } from "shared/types";
import type { Task } from "./types";
import { transformWorktreeToTask } from "./utils";

export function useTaskData(
	isOpen: boolean,
	mode: "list" | "new",
	workspaceId: string | null,
	worktrees?: Worktree[],
) {
	const [tasks, setTasks] = useState<Task[]>([]);
	const [isLoadingTasks, setIsLoadingTasks] = useState(false);
	const [tasksError, setTasksError] = useState<string | null>(null);
	const fetchRef = useRef<(() => Promise<void>) | null>(null);

	const fetchTasks = useCallback(async () => {
		if (!workspaceId) {
			setTasks([]);
			return;
		}

		setIsLoadingTasks(true);
		setTasksError(null);

		try {
			// Fetch workspace from config via IPC
			const workspace = await window.ipcRenderer.invoke(
				"workspace-get",
				workspaceId,
			);

			if (!workspace) {
				throw new Error("Workspace not found");
			}

			// Transform worktrees to tasks
			const transformedTasks = workspace.worktrees.map(transformWorktreeToTask);
			setTasks(transformedTasks);
			setTasksError(null);
		} catch (error) {
			console.error("Failed to fetch tasks:", error);
			setTasksError(
				error instanceof Error
					? error.message
					: "Failed to load tasks from workspace.",
			);
			setTasks([]);
		} finally {
			setIsLoadingTasks(false);
		}
	}, [workspaceId]);

	// Store fetch function in ref so it can be called externally
	useEffect(() => {
		fetchRef.current = fetchTasks;
	}, [fetchTasks]);

	// Fetch tasks when modal opens or worktrees change
	useEffect(() => {
		if (!isOpen || mode !== "list" || !workspaceId) {
			setTasks([]);
			return;
		}

		void fetchTasks();
	}, [isOpen, mode, workspaceId, fetchTasks, worktrees?.length]);

	return { tasks, isLoadingTasks, tasksError, refetch: fetchTasks };
}

