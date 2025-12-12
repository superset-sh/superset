import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type AppView = "workspace" | "settings";
export type SettingsSection =
	| "project"
	| "workspace"
	| "appearance"
	| "keyboard"
	| "presets"
	| "ringtones";

interface AppState {
	currentView: AppView;
	isSettingsTabOpen: boolean;
	settingsSection: SettingsSection;
	setView: (view: AppView) => void;
	openSettings: (section?: SettingsSection) => void;
	closeSettings: () => void;
	closeSettingsTab: () => void;
	setSettingsSection: (section: SettingsSection) => void;
}

export const useAppStore = create<AppState>()(
	devtools(
		(set) => ({
			currentView: "workspace",
			isSettingsTabOpen: false,
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
		}),
		{ name: "AppStore" },
	),
);

// Convenience hooks
export const useCurrentView = () => useAppStore((state) => state.currentView);
export const useIsSettingsTabOpen = () =>
	useAppStore((state) => state.isSettingsTabOpen);
export const useSettingsSection = () =>
	useAppStore((state) => state.settingsSection);
export const useSetSettingsSection = () =>
	useAppStore((state) => state.setSettingsSection);
export const useOpenSettings = () => useAppStore((state) => state.openSettings);
export const useCloseSettings = () =>
	useAppStore((state) => state.closeSettings);
export const useCloseSettingsTab = () =>
	useAppStore((state) => state.closeSettingsTab);
