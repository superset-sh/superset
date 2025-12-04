import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type AppView = "workspace" | "settings" | "ssh";
export type SettingsSection = "appearance" | "keyboard";

interface AppState {
	currentView: AppView;
	isSettingsTabOpen: boolean;
	settingsSection: SettingsSection;
	activeSSHConnectionId: string | null;
	setView: (view: AppView) => void;
	openSettings: (section?: SettingsSection) => void;
	closeSettings: () => void;
	closeSettingsTab: () => void;
	setSettingsSection: (section: SettingsSection) => void;
	openSSH: (connectionId: string) => void;
	closeSSH: () => void;
}

export const useAppStore = create<AppState>()(
	devtools(
		(set) => ({
			currentView: "workspace",
			isSettingsTabOpen: false,
			settingsSection: "appearance",
			activeSSHConnectionId: null,

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

			openSSH: (connectionId) => {
				set({
					currentView: "ssh",
					activeSSHConnectionId: connectionId,
				});
			},

			closeSSH: () => {
				set({
					currentView: "workspace",
					activeSSHConnectionId: null,
				});
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
export const useActiveSSHConnectionId = () =>
	useAppStore((state) => state.activeSSHConnectionId);
export const useOpenSSH = () => useAppStore((state) => state.openSSH);
export const useCloseSSH = () => useAppStore((state) => state.closeSSH);
