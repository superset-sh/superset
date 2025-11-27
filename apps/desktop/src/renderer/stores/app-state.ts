import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type AppView = "workspace" | "settings";

interface AppState {
	currentView: AppView;
	setView: (view: AppView) => void;
	openSettings: () => void;
	closeSettings: () => void;
}

export const useAppStore = create<AppState>()(
	devtools(
		(set) => ({
			currentView: "workspace",

			setView: (view) => {
				set({ currentView: view });
			},

			openSettings: () => {
				set({ currentView: "settings" });
			},

			closeSettings: () => {
				set({ currentView: "workspace" });
			},
		}),
		{ name: "AppStore" },
	),
);

// Convenience hooks
export const useCurrentView = () => useAppStore((state) => state.currentView);
export const useOpenSettings = () => useAppStore((state) => state.openSettings);
export const useCloseSettings = () =>
	useAppStore((state) => state.closeSettings);
