import { useEffect, useRef, useState } from "react";
import type { Worktree } from "shared/types";
import type { TaskStatus } from "../components/Layout/StatusIndicator";
import type { UITask, PendingWorktree } from "../types";
import { MOCK_TASKS } from "../constants";

interface UseTasksProps {
	currentWorkspace: {
		id: string;
		worktrees?: Worktree[];
	} | null;
	setSelectedWorktreeId: (id: string | null) => void;
	handleTabSelect: (worktreeId: string, tabId: string) => void;
	handleWorktreeCreated: () => Promise<void>;
}

export function useTasks({
	currentWorkspace,
	setSelectedWorktreeId,
	handleTabSelect,
	handleWorktreeCreated,
}: UseTasksProps) {
	const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
	const [addTaskModalInitialMode, setAddTaskModalInitialMode] = useState<"list" | "new">("list");
	const [branches, setBranches] = useState<string[]>([]);
	const [isCreatingWorktree, setIsCreatingWorktree] = useState(false);
	const [setupStatus, setSetupStatus] = useState<string | undefined>(undefined);
	const [setupOutput, setSetupOutput] = useState<string | undefined>(undefined);
	const [pendingWorktrees, setPendingWorktrees] = useState<PendingWorktree[]>(
		[],
	);
	const progressHandlerRef = useRef<((data: { status: string; output: string }) => void) | null>(null);
	const isHandlingProgressRef = useRef(false);

	// Cleanup IPC listener on unmount or when creation completes
	useEffect(() => {
		return () => {
			if (progressHandlerRef.current) {
				window.ipcRenderer.removeListener("worktree-setup-progress", progressHandlerRef.current);
				progressHandlerRef.current = null;
			}
			isHandlingProgressRef.current = false;
		};
	}, []);

	// Compute which tasks have worktrees (are "open")
	const openTasks = MOCK_TASKS.filter((task) =>
		currentWorkspace?.worktrees?.some((wt) => wt.branch === task.branch),
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

		// Find existing worktree for this task's branch
		const existingWorktree = currentWorkspace.worktrees?.find(
			(wt) => wt.branch === task.branch,
		);

		if (existingWorktree) {
			// Worktree already exists - switch to it
			setSelectedWorktreeId(existingWorktree.id);
			if (existingWorktree.tabs && existingWorktree.tabs.length > 0) {
				handleTabSelect(existingWorktree.id, existingWorktree.tabs[0].id);
			}
			handleCloseAddTaskModal();
		} else {
			// Worktree doesn't exist - create it with optimistic update
			const pendingId = `pending-${Date.now()}`;
			const pendingWorktree: PendingWorktree = {
				id: pendingId,
				isPending: true,
				title: task.name,
				branch: task.branch,
				description: task.description,
				taskData: {
					slug: task.slug,
					name: task.name,
					status: task.status,
				},
			};

			// Add pending worktree immediately
			setPendingWorktrees((prev) => [...prev, pendingWorktree]);
			handleCloseAddTaskModal();

			void (async () => {
				try {
					const result = await window.ipcRenderer.invoke("worktree-create", {
						workspaceId: currentWorkspace.id,
						title: task.name,
						branch: task.branch,
						createBranch: false, // Branch should already exist
						description: task.description,
					});

					if (result.success && result.worktree) {
						// Remove pending worktree
						setPendingWorktrees((prev) =>
							prev.filter((wt) => wt.id !== pendingId),
						);
						// Refresh workspace to get the real worktree
						await handleWorktreeCreated();
						setSelectedWorktreeId(result.worktree.id);
						if (result.worktree.tabs && result.worktree.tabs.length > 0) {
							handleTabSelect(result.worktree.id, result.worktree.tabs[0].id);
						}
					} else {
						// Remove pending on failure
						setPendingWorktrees((prev) =>
							prev.filter((wt) => wt.id !== pendingId),
						);
					}
				} catch (error) {
					console.error("Failed to create worktree for task:", error);
					// Remove pending on error
					setPendingWorktrees((prev) =>
						prev.filter((wt) => wt.id !== pendingId),
					);
				}
			})();
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
			window.ipcRenderer.removeListener("worktree-setup-progress", progressHandlerRef.current);
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
				await handleWorktreeCreated();

				// Only close modal and select worktree if modal is still open
				if (isAddTaskModalOpen) {
					// Close modal and reset state
					setIsAddTaskModalOpen(false);
					setSetupStatus(undefined);
					setSetupOutput(undefined);

					// Switch to the new worktree if available
					if (result.worktree) {
						setSelectedWorktreeId(result.worktree.id);
						if (result.worktree.tabs && result.worktree.tabs.length > 0) {
							handleTabSelect(result.worktree.id, result.worktree.tabs[0].id);
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
			
			// Wait a bit to ensure any queued events are processed, then remove listener
			setTimeout(() => {
				if (progressHandlerRef.current) {
					window.ipcRenderer.removeListener("worktree-setup-progress", progressHandlerRef.current);
					progressHandlerRef.current = null;
				}
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

