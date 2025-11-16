import type React from "react";
import { createContext, useContext } from "react";
import type { TaskStatus } from "../screens/main/components/Layout/StatusIndicator";
import { useTasks } from "../screens/main/hooks";
import type { PendingWorktree, UITask } from "../screens/main/types";
import { useTabContext } from "./TabContext";
import { useWorkspaceContext } from "./WorkspaceContext";
import { useWorktreeOperationsContext } from "./WorktreeOperationsContext";

interface TaskContextValue {
	isAddTaskModalOpen: boolean;
	addTaskModalInitialMode: "list" | "new";
	branches: string[];
	isCreatingWorktree: boolean;
	setupStatus: string | undefined;
	setupOutput: string | undefined;
	pendingWorktrees: PendingWorktree[];
	openTasks: UITask[];
	handleOpenAddTaskModal: (mode?: "list" | "new") => void;
	handleCloseAddTaskModal: () => void;
	handleSelectTask: (task: UITask) => void;
	handleCreateTask: (taskData: {
		name: string;
		description: string;
		status: TaskStatus;
		assignee: string;
		branch: string;
		sourceBranch?: string;
		cloneTabsFromWorktreeId?: string;
	}) => Promise<void>;
	handleClearStatus: () => void;
}

const TaskContext = createContext<TaskContextValue | undefined>(undefined);

interface TaskProviderProps {
	children: React.ReactNode;
}

export function TaskProvider({ children }: TaskProviderProps) {
	const { currentWorkspace } = useWorkspaceContext();
	const { setSelectedWorktreeId, handleTabSelect } = useTabContext();
	const { handleWorktreeCreatedWithResult } = useWorktreeOperationsContext();

	const taskData = useTasks({
		currentWorkspace,
		setSelectedWorktreeId,
		handleTabSelect,
		handleWorktreeCreated: handleWorktreeCreatedWithResult,
	});

	return (
		<TaskContext.Provider value={taskData}>{children}</TaskContext.Provider>
	);
}

export function useTaskContext() {
	const context = useContext(TaskContext);
	if (context === undefined) {
		throw new Error("useTaskContext must be used within a TaskProvider");
	}
	return context;
}
