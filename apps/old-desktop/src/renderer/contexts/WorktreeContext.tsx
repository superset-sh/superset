import type React from "react";
import { createContext, useContext } from "react";
import type { Worktree } from "shared/types";

interface WorktreeContextValue {
	currentWorktree: Worktree | null;
	worktreeId: string | null;
	workspaceId: string | null;
	workspaceName?: string;
	mainBranch?: string;
}

const WorktreeContext = createContext<WorktreeContextValue | undefined>(
	undefined,
);

export function WorktreeProvider({
	children,
	value,
}: {
	children: React.ReactNode;
	value: WorktreeContextValue;
}) {
	return (
		<WorktreeContext.Provider value={value}>
			{children}
		</WorktreeContext.Provider>
	);
}

export function useWorktree() {
	const context = useContext(WorktreeContext);
	if (context === undefined) {
		throw new Error("useWorktree must be used within a WorktreeProvider");
	}
	return context;
}
