import type { WorkspaceStore } from "@superset/panes";
import { createContext, useContext, useSyncExternalStore } from "react";
import { useGitStatus } from "renderer/hooks/host-service/useGitStatus";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";

type WorkspaceGitStatus = ReturnType<typeof useGitStatus>;

const WorkspaceGitStatusContext = createContext<WorkspaceGitStatus | null>(
	null,
);

interface WorkspaceGitStatusProviderProps {
	children: React.ReactNode;
	sidebarOpen: boolean;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	workspaceId: string;
}

export function WorkspaceGitStatusProvider({
	children,
	sidebarOpen,
	store,
	workspaceId,
}: WorkspaceGitStatusProviderProps) {
	const hasDiffPane = useHasDiffPane(store);
	const gitStatus = useGitStatus(workspaceId, sidebarOpen || hasDiffPane);

	return (
		<WorkspaceGitStatusContext.Provider value={gitStatus}>
			{children}
		</WorkspaceGitStatusContext.Provider>
	);
}

export function useWorkspaceGitStatus(): WorkspaceGitStatus {
	const value = useContext(WorkspaceGitStatusContext);
	if (!value) {
		throw new Error(
			"useWorkspaceGitStatus must be used inside WorkspaceGitStatusProvider",
		);
	}
	return value;
}

function hasDiffPane(store: StoreApi<WorkspaceStore<PaneViewerData>>): boolean {
	const state = store.getState();
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind === "diff") return true;
		}
	}
	return false;
}

function useHasDiffPane(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
): boolean {
	return useSyncExternalStore(
		store.subscribe,
		() => hasDiffPane(store),
		() => false,
	);
}
