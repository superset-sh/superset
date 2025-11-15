import type React from "react";
import { createContext, useContext } from "react";
import type { Workspace, Worktree } from "shared/types";

interface WorkspaceOperationsContextValue {
	// Worktree operations
	handleWorktreeCreated: () => Promise<void>;
	handleUpdateWorktree: (worktreeId: string, updatedWorktree: Worktree) => void;
	handleCreatePR: (worktreeId: string | null) => Promise<void>;
	handleMergePR: (worktreeId: string | null) => Promise<void>;
	handleDeleteWorktree: (worktreeId: string) => Promise<void>;

	// Workspace state
	currentWorkspace: Workspace | null;
	workspaces: Workspace[] | null;

	// Workspace operations
	handleWorkspaceSelect: (workspaceId: string) => Promise<void>;
	loadAllWorkspaces: () => Promise<void>;
}

const WorkspaceOperationsContext = createContext<WorkspaceOperationsContextValue | null>(null);

export function useWorkspaceOperations() {
	const context = useContext(WorkspaceOperationsContext);
	if (!context) {
		throw new Error("useWorkspaceOperations must be used within WorkspaceOperationsProvider");
	}
	return context;
}

interface WorkspaceOperationsProviderProps {
	value: WorkspaceOperationsContextValue;
	children: React.ReactNode;
}

export function WorkspaceOperationsProvider({ value, children }: WorkspaceOperationsProviderProps) {
	return (
		<WorkspaceOperationsContext.Provider value={value}>
			{children}
		</WorkspaceOperationsContext.Provider>
	);
}
