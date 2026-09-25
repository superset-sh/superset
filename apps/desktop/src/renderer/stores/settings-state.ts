import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type SettingsSection =
	| "mobile"
	| "account"
	| "organization"
	| "teams"
	| "appearance"
	| "ringtones"
	| "usage"
	| "keyboard"
	| "behavior"
	| "browser"
	| "git"
	| "agents"
	| "terminal"
	| "links"
	| "experimental"
	| "integrations"
	| "billing"
	| "apikeys"
	| "permissions"
	| "security"
	| "project"
	| "hosts"
	| "environments"
	| "agentAccounts"
	| "connections";

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
			originRoute: "/new-workspace",

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

export const useSettingsSearchQuery = () =>
	useSettingsStore((state) => state.searchQuery);
export const useSetSettingsSearchQuery = () =>
	useSettingsStore((state) => state.setSearchQuery);
export const useSettingsOriginRoute = () =>
	useSettingsStore((state) => state.originRoute);
