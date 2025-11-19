import { useEffect, useRef, useState } from "react";
import type { Worktree } from "shared/types";
import { transformWorktreeToTask } from "../components/Layout/AddTaskModal/utils";
import type { TaskStatus } from "../components/Layout/StatusIndicator";
import type { PendingWorktree, UITask } from "../types";

interface UseTasksProps {
	currentWorkspace: {
		id: string;
		worktrees?: Worktree[];
	} | null;
	setSelectedWorktreeId: (id: string | null) => void;
	handleTabSelect: (worktreeId: string, tabId: string) => void;
	handleWorktreeCreated: () => Promise<{
		id: string;
		worktrees?: Worktree[];
	} | null>;
}

export function useTasks({
	currentWorkspace,
	setSelectedWorktreeId,
	handleTabSelect,
	handleWorktreeCreated,
}: UseTasksProps) {
	const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
	const [addTaskModalInitialMode, setAddTaskModalInitialMode] = useState<
		"list" | "new"
	>("list");
	const [branches, setBranches] = useState<string[]>([]);
	const [isCreatingWorktree, setIsCreatingWorktree] = useState(false);
	const [setupStatus, setSetupStatus] = useState<string | undefined>(undefined);
	const [setupOutput, setSetupOutput] = useState<string | undefined>(undefined);
	const [pendingWorktrees, setPendingWorktrees] = useState<PendingWorktree[]>(
		[],
	);
	const progressHandlerRef = useRef<
		((data: { status: string; output: string }) => void) | null
	>(null);
	const isHandlingProgressRef = useRef(false);
	const cleanupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	// Cleanup IPC listener on unmount or when creation completes
	useEffect(() => {
		return () => {
			if (cleanupTimeoutRef.current) {
				clearTimeout(cleanupTimeoutRef.current);
				cleanupTimeoutRef.current = null;
			}
			if (progressHandlerRef.current) {
				window.ipcRenderer.off(
					"worktree-setup-progress",
					progressHandlerRef.current,
				);
				progressHandlerRef.current = null;
			}
			isHandlingProgressRef.current = false;
		};
	}, []);

	// Compute open tasks from worktrees (all worktrees are "open" as tabs)
	const openTasks: UITask[] = (currentWorkspace?.worktrees || []).map(
		transformWorktreeToTask,
	);

	const handleOpenAddTaskModal = (mode: "list" | "new" = "list") => {
		setAddTaskModalInitialMode(mode);
		setIsAddTaskModalOpen(true);

		// Fetch branches when opening in new mode
		if (mode === "new" && currentWorkspace) {
			void (async () => {
				const result = await window.ipcRenderer.invoke(
					"workspace-list-branches",
					currentWorkspace.id,
				);
				setBranches(result.branches);
			})();
		}
	};

	const handleCloseAddTaskModal = () => {
		if (isCreatingWorktree) return; // Prevent closing while creating
		setIsAddTaskModalOpen(false);
		setIsCreatingWorktree(false);
		setSetupStatus(undefined);
		setSetupOutput(undefined);
	};

	const handleClearStatus = () => {
		setSetupStatus(undefined);
		setSetupOutput(undefined);
	};

	const handleSelectTask = (task: UITask) => {
		if (!currentWorkspace) return;

		// Since tasks are now worktrees from config, find worktree by ID directly
		const existingWorktree = currentWorkspace.worktrees?.find(
			(wt) => wt.id === task.id,
		);

		if (existingWorktree) {
			// Worktree exists - switch to it
			setSelectedWorktreeId(existingWorktree.id);
			if (existingWorktree.tabs && existingWorktree.tabs.length > 0) {
				handleTabSelect(existingWorktree.id, existingWorktree.tabs[0].id);
			}
			handleCloseAddTaskModal();
		} else {
			// Worktree not found - this shouldn't happen if data is in sync
			console.warn("Worktree not found for task:", task.id);
			handleCloseAddTaskModal();
		}
	};

	const handleCreateTask = async (taskData: {
		name: string;
		description: string;
		status: TaskStatus;
		assignee: string;
		branch: string;
		sourceBranch?: string;
		cloneTabsFromWorktreeId?: string;
	}) => {
		if (!currentWorkspace) return;

		setIsCreatingWorktree(true);
		setSetupStatus("Creating git worktree...");
		setSetupOutput(undefined);

		// Clean up any existing listener first
		if (progressHandlerRef.current) {
			window.ipcRenderer.off(
				"worktree-setup-progress",
				progressHandlerRef.current,
			);
		}

		isHandlingProgressRef.current = true;

		// Listen for setup progress events
		const progressHandler = (data: { status: string; output: string }) => {
			// Ignore events if we're no longer handling progress
			if (!isHandlingProgressRef.current) return;

			if (data && data.status !== undefined && data.output !== undefined) {
				setSetupStatus(data.status);
				setSetupOutput(data.output);
			}
		};
		progressHandlerRef.current = progressHandler;
		window.ipcRenderer.on("worktree-setup-progress", progressHandler);

		try {
			// Create a worktree for this task
			const result = await window.ipcRenderer.invoke("worktree-create", {
				workspaceId: currentWorkspace.id,
				title: taskData.name,
				...(taskData.branch.trim() && { branch: taskData.branch.trim() }),
				createBranch: true,
				...(taskData.sourceBranch && { sourceBranch: taskData.sourceBranch }),
				...(taskData.cloneTabsFromWorktreeId && {
					cloneTabsFromWorktreeId: taskData.cloneTabsFromWorktreeId,
				}),
				...(taskData.description.trim() && {
					description: taskData.description.trim(),
				}),
			});

			if (result.success) {
				// Display setup result if available
				if (result.setupResult) {
					setSetupStatus(
						result.setupResult.success
							? "Setup completed successfully!"
							: "Setup completed with errors",
					);
					setSetupOutput(result.setupResult.output);
				} else {
					setSetupStatus("Task created successfully!");
				}

				setIsCreatingWorktree(false);

				// Reload workspace to get the new worktree
				// handleWorktreeCreated returns the refreshed workspace directly
				const refreshedWorkspace = await handleWorktreeCreated();

				// Wait for React to process the state update from handleWorktreeCreated
				// This ensures handleTabSelect sees the updated workspace in its functional setState
				await new Promise((resolve) => setTimeout(resolve, 50));

				// Only close modal and select worktree if modal is still open
				if (isAddTaskModalOpen) {
					// Close modal and reset state
					setIsAddTaskModalOpen(false);
					setSetupStatus(undefined);
					setSetupOutput(undefined);

					// Switch to the new worktree if available
					// Use the refreshed workspace returned by handleWorktreeCreated
					if (result.worktree && refreshedWorkspace) {
						// Find the worktree by branch name to get the correct ID
						const newWorktree = refreshedWorkspace.worktrees?.find(
							(wt) => wt.branch === result.worktree?.branch,
						);

						if (newWorktree) {
							setSelectedWorktreeId(newWorktree.id);
							if (newWorktree.tabs && newWorktree.tabs.length > 0) {
								handleTabSelect(newWorktree.id, newWorktree.tabs[0].id);
							}
						}
					}
				}
			} else {
				console.error("[useTasks] Failed to create worktree:", result.error);
				setSetupStatus("Failed to create worktree");
				setSetupOutput(result.error);
				setIsCreatingWorktree(false);
				// Don't close modal on error so user can see what went wrong
			}
		} catch (error) {
			console.error("[useTasks] Error creating worktree:", error);
			setSetupStatus("Error creating worktree");
			setSetupOutput(String(error));
			setIsCreatingWorktree(false);
		} finally {
			// Stop handling progress events
			isHandlingProgressRef.current = false;

			// Clear any existing cleanup timeout
			if (cleanupTimeoutRef.current) {
				clearTimeout(cleanupTimeoutRef.current);
			}

			// Wait a bit to ensure any queued events are processed, then remove listener
			cleanupTimeoutRef.current = setTimeout(() => {
				if (progressHandlerRef.current) {
					window.ipcRenderer.off(
						"worktree-setup-progress",
						progressHandlerRef.current,
					);
					progressHandlerRef.current = null;
				}
				cleanupTimeoutRef.current = null;
			}, 100);
		}
	};

	return {
		isAddTaskModalOpen,
		addTaskModalInitialMode,
		branches,
		isCreatingWorktree,
		setupStatus,
		setupOutput,
		pendingWorktrees,
		openTasks,
		handleOpenAddTaskModal,
		handleCloseAddTaskModal,
		handleSelectTask,
		handleCreateTask,
		handleClearStatus,
	};
}
