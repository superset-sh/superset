import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type SettingsSection =
	| "account"
	| "organization"
	| "appearance"
	| "ringtones"
	| "keyboard"
	| "behavior"
	| "git"
	| "agents"
	| "terminal"
	| "links"
	| "models"
	| "experimental"
	| "integrations"
	| "billing"
	| "apikeys"
	| "permissions"
	| "security"
	| "project"
	| "hosts";

interface SettingsState {
	activeSection: SettingsSection;
	activeProjectId: string | null;
	searchQuery: string;
	isOpen: boolean;
	originRoute: string;

	setActiveSection: (section: SettingsSection) => void;
	setActiveProject: (projectId: string | null) => void;
	setSearchQuery: (query: string) => void;
	openSettings: (section?: SettingsSection) => void;
	closeSettings: () => void;
	setOriginRoute: (route: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
	devtools(
		(set) => ({
			activeSection: "account",
			activeProjectId: null,
			searchQuery: "",
			isOpen: false,
			originRoute: "/workspace",

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

			setOriginRoute: (route) => set({ originRoute: route }),
		}),
		{ name: "SettingsStore" },
	),
);

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
export const useSettingsOriginRoute = () =>
	useSettingsStore((state) => state.originRoute);
