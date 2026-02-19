import { create } from "zustand";
import { devtools } from "zustand/middleware";

/**
 * Settings sections available in the settings view.
 * General sections are the main categories, project/workspace are dynamic.
 */
export type SettingsSection =
	| "account"
	| "organization"
	| "appearance"
	| "ringtones"
	| "keyboard"
	| "behavior"
	| "terminal"
	| "integrations"
	| "billing"
	| "devices"
	| "apikeys"
	| "permissions"
	| "project";

interface SettingsState {
	activeSection: SettingsSection;
	activeProjectId: string | null;
	searchQuery: string;
	isOpen: boolean;

	setActiveSection: (section: SettingsSection) => void;
	setActiveProject: (projectId: string | null) => void;
	setSearchQuery: (query: string) => void;
	openSettings: (section?: SettingsSection) => void;
	closeSettings: () => void;
}

export const useSettingsStore = create<SettingsState>()(
	devtools(
		(set) => ({
			activeSection: "account",
			activeProjectId: null,
			searchQuery: "",
			isOpen: false,

			setActiveSection: (section) => set({ activeSection: section }),

			setActiveProject: (projectId) =>
				set({
					activeProjectId: projectId,
					activeSection: "project",
				}),

			setSearchQuery: (query) => set({ searchQuery: query }),

			openSettings: (section) =>
				set({
					isOpen: true,
					activeSection: section ?? "account",
				}),

			closeSettings: () =>
				set({
					isOpen: false,
					searchQuery: "",
				}),
		}),
		{ name: "SettingsStore" },
	),
);

// Convenience hooks
export const useSettingsSection = () =>
	useSettingsStore((state) => state.activeSection);
export const useSetSettingsSection = () =>
	useSettingsStore((state) => state.setActiveSection);
export const useSettingsSearchQuery = () =>
	useSettingsStore((state) => state.searchQuery);
export const useSetSettingsSearchQuery = () =>
	useSettingsStore((state) => state.setSearchQuery);
export const useActiveProjectId = () =>
	useSettingsStore((state) => state.activeProjectId);
export const useCloseSettings = () =>
	useSettingsStore((state) => state.closeSettings);
