import { useEffect, useState } from "react";
import type { APITask, Task } from "./types";
import { transformAPITaskToUITask } from "./utils";

export function useTaskData(
	isOpen: boolean,
	mode: "list" | "new",
	apiBaseUrl: string,
) {
	const [tasks, setTasks] = useState<Task[]>([]);
	const [isLoadingTasks, setIsLoadingTasks] = useState(false);
	const [tasksError, setTasksError] = useState<string | null>(null);

	// Fetch tasks when modal opens
	useEffect(() => {
		if (!isOpen || mode !== "list") return;

		let cancelled = false;
		setIsLoadingTasks(true);
		setTasksError(null);

		const fetchTasks = async () => {
			try {
				const url = `${apiBaseUrl}/api/trpc/task.all?input=${encodeURIComponent("{}")}`;
				const response = await fetch(url, {
					method: "GET",
					headers: {
						"Content-Type": "application/json",
					},
				});

				if (!response.ok) {
					throw new Error(`Failed to fetch tasks: ${response.statusText}`);
				}

				const data = await response.json();

				// Handle different possible response formats
				let apiTasks: APITask[] = [];
				if (data.result?.data) {
					apiTasks = Array.isArray(data.result.data) ? data.result.data : [];
				} else if (data.result?.json) {
					apiTasks = Array.isArray(data.result.json) ? data.result.json : [];
				} else if (Array.isArray(data)) {
					apiTasks = data;
				} else if (Array.isArray(data.result)) {
					apiTasks = data.result;
				}

				if (!cancelled) {
					const transformedTasks = apiTasks.map(transformAPITaskToUITask);
					setTasks(transformedTasks);
					setTasksError(null);
				}
			} catch (error) {
				if (!cancelled) {
					console.error("Failed to fetch tasks:", error);
					setTasksError(
						error instanceof Error
							? error.message
							: "Failed to load tasks. Please check if the API server is running.",
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
	}, [isOpen, mode, apiBaseUrl]);

	return { tasks, isLoadingTasks, tasksError };
}

