import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type AppView = "workspace" | "settings" | "tasks" | "workspaces-list";
export type SettingsSection =
	| "account"
	| "project"
	| "workspace"
	| "appearance"
	| "keyboard"
	| "presets"
	| "ringtones"
	| "behavior";

interface AppState {
	currentView: AppView;
	isSettingsTabOpen: boolean;
	isTasksTabOpen: boolean;
	isWorkspacesListOpen: boolean;
	settingsSection: SettingsSection;
	setView: (view: AppView) => void;
	openSettings: (section?: SettingsSection) => void;
	closeSettings: () => void;
	closeSettingsTab: () => void;
	setSettingsSection: (section: SettingsSection) => void;
	openTasks: () => void;
	closeTasks: () => void;
	openWorkspacesList: () => void;
	closeWorkspacesList: () => void;
}

export const useAppStore = create<AppState>()(
	devtools(
		(set) => ({
			currentView: "workspace",
			isSettingsTabOpen: false,
			isTasksTabOpen: false,
			isWorkspacesListOpen: false,
			settingsSection: "project",

			setView: (view) => {
				set({ currentView: view });
			},

			openSettings: (section) => {
				set({
					currentView: "settings",
					isSettingsTabOpen: true,
					...(section && { settingsSection: section }),
				});
			},

			closeSettings: () => {
				set({ currentView: "workspace" });
			},

			closeSettingsTab: () => {
				set({ currentView: "workspace", isSettingsTabOpen: false });
			},

			setSettingsSection: (section) => {
				set({ settingsSection: section });
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
export const useIsSettingsTabOpen = () =>
	useAppStore((state) => state.isSettingsTabOpen);
export const useIsTasksTabOpen = () =>
	useAppStore((state) => state.isTasksTabOpen);
export const useSettingsSection = () =>
	useAppStore((state) => state.settingsSection);
export const useSetSettingsSection = () =>
	useAppStore((state) => state.setSettingsSection);
export const useOpenSettings = () => useAppStore((state) => state.openSettings);
export const useCloseSettings = () =>
	useAppStore((state) => state.closeSettings);
export const useCloseSettingsTab = () =>
	useAppStore((state) => state.closeSettingsTab);
export const useOpenTasks = () => useAppStore((state) => state.openTasks);
export const useCloseTasks = () => useAppStore((state) => state.closeTasks);
export const useOpenWorkspacesList = () =>
	useAppStore((state) => state.openWorkspacesList);
export const useCloseWorkspacesList = () =>
	useAppStore((state) => state.closeWorkspacesList);
