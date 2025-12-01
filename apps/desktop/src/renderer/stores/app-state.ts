import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type AppView = "workspace" | "settings";
export type SettingsSection = "appearance" | "keyboard";

interface AppState {
	currentView: AppView;
	settingsSection: SettingsSection;
	setView: (view: AppView) => void;
	openSettings: (section?: SettingsSection) => void;
	closeSettings: () => void;
	setSettingsSection: (section: SettingsSection) => void;
}

export const useAppStore = create<AppState>()(
	devtools(
		(set) => ({
			currentView: "workspace",
			settingsSection: "appearance",

			setView: (view) => {
				set({ currentView: view });
			},

			openSettings: (section) => {
				set({
					currentView: "settings",
					...(section && { settingsSection: section }),
				});
			},

			closeSettings: () => {
				set({ currentView: "workspace" });
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
export const useSettingsSection = () =>
	useAppStore((state) => state.settingsSection);
export const useSetSettingsSection = () =>
	useAppStore((state) => state.setSettingsSection);
export const useOpenSettings = () => useAppStore((state) => state.openSettings);
export const useCloseSettings = () =>
	useAppStore((state) => state.closeSettings);
