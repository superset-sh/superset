import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type AppView = "workspace" | "tasks" | "workspaces-list";

interface AppState {
	currentView: AppView;
	isTasksTabOpen: boolean;
	isWorkspacesListOpen: boolean;
	setView: (view: AppView) => void;
	openTasks: () => void;
	closeTasks: () => void;
	openWorkspacesList: () => void;
	closeWorkspacesList: () => void;
}

export const useAppStore = create<AppState>()(
	devtools(
		(set) => ({
			currentView: "workspace",
			isTasksTabOpen: false,
			isWorkspacesListOpen: false,

			setView: (view) => {
				set({ currentView: view });
			},

			openTasks: () => {
				set({ currentView: "tasks", isTasksTabOpen: true });
			},

			closeTasks: () => {
				set({ currentView: "workspace", isTasksTabOpen: false });
			},

			openWorkspacesList: () => {
				set({ currentView: "workspaces-list", isWorkspacesListOpen: true });
			},

			closeWorkspacesList: () => {
				set({ currentView: "workspace", isWorkspacesListOpen: false });
			},
		}),
		{ name: "AppStore" },
	),
);

// Convenience hooks
export const useCurrentView = () => useAppStore((state) => state.currentView);
export const useOpenTasks = () => useAppStore((state) => state.openTasks);
export const useOpenWorkspacesList = () =>
	useAppStore((state) => state.openWorkspacesList);
export const useCloseWorkspacesList = () =>
	useAppStore((state) => state.closeWorkspacesList);
