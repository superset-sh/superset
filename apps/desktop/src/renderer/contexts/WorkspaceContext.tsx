import type React from "react";
import { createContext, useContext } from "react";
import type { Workspace } from "shared/types";
import { useWorkspace } from "../screens/main/hooks";

interface WorkspaceContextValue {
    workspaces: Workspace[] | null;
    currentWorkspace: Workspace | null;
    setCurrentWorkspace: React.Dispatch<React.SetStateAction<Workspace | null>>;
    setWorkspaces: React.Dispatch<React.SetStateAction<Workspace[] | null>>;
    loading: boolean;
    error: string | null;
    showWorkspaceSelection: boolean;
    setShowWorkspaceSelection: React.Dispatch<React.SetStateAction<boolean>>;
    loadAllWorkspaces: () => Promise<void>;
    handleWorkspaceSelect: (workspaceId: string) => Promise<void>;
    handleWorkspaceSelectFromModal: (workspaceId: string) => Promise<void>;
    handleCreateWorkspaceFromModal: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(
    undefined,
);

interface WorkspaceProviderProps {
    children: React.ReactNode;
    setSelectedWorktreeId?: (id: string | null) => void;
    setSelectedTabId?: (id: string | null) => void;
}

export function WorkspaceProvider({
    children,
    setSelectedWorktreeId,
    setSelectedTabId,
}: WorkspaceProviderProps) {
    const workspaceData = useWorkspace({
        setSelectedWorktreeId,
        setSelectedTabId,
    });

    return (
        <WorkspaceContext.Provider value={workspaceData}>
            {children}
        </WorkspaceContext.Provider>
    );
}

export function useWorkspaceContext() {
    const context = useContext(WorkspaceContext);
    if (context === undefined) {
        throw new Error(
            "useWorkspaceContext must be used within a WorkspaceProvider",
        );
    }
    return context;
}
