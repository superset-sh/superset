import type React from "react";
import { createContext, useContext } from "react";
import type { Worktree } from "shared/types";
import { useWorktrees } from "../screens/main/hooks";
import { useWorkspaceContext } from "./WorkspaceContext";
import { useTabContext } from "./TabContext";

interface WorktreeOperationsContextValue {
	handleWorktreeCreated: () => Promise<void>;
	handleWorktreeCreatedWithResult: () => Promise<{ id: string; worktrees?: Worktree[] } | null>;
	handleUpdateWorktree: (worktreeId: string, updatedWorktree: Worktree) => void;
	handleCreatePR: (selectedWorktreeId: string | null) => Promise<void>;
	handleMergePR: (selectedWorktreeId: string | null) => Promise<void>;
	handleDeleteWorktree: (worktreeId: string) => Promise<void>;
}

const WorktreeOperationsContext = createContext<WorktreeOperationsContextValue | undefined>(
	undefined,
);

interface WorktreeOperationsProviderProps {
	children: React.ReactNode;
}

export function WorktreeOperationsProvider({ children }: WorktreeOperationsProviderProps) {
	const { currentWorkspace, setCurrentWorkspace, setWorkspaces, loadAllWorkspaces } = useWorkspaceContext();
	const { selectedWorktreeId, setSelectedWorktreeId, setSelectedTabId } = useTabContext();

	const worktreeOperations = useWorktrees({
		currentWorkspace,
		setCurrentWorkspace,
		setWorkspaces,
		loadAllWorkspaces,
		selectedWorktreeId,
		setSelectedWorktreeId,
		setSelectedTabId,
	});

	return (
		<WorktreeOperationsContext.Provider value={worktreeOperations}>
			{children}
		</WorktreeOperationsContext.Provider>
	);
}

export function useWorktreeOperationsContext() {
	const context = useContext(WorktreeOperationsContext);
	if (context === undefined) {
		throw new Error("useWorktreeOperationsContext must be used within a WorktreeOperationsProvider");
	}
	return context;
}

