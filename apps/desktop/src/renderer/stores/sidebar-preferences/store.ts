import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface SidebarPreferencesState {
	/** When true, sidebar workspace names wrap onto multiple lines instead of truncating. */
	wrapWorkspaceNames: boolean;
	setWrapWorkspaceNames: (wrap: boolean) => void;
}

export const useSidebarPreferencesStore = create<SidebarPreferencesState>()(
	devtools(
		persist(
			(set) => ({
				wrapWorkspaceNames: false,

				setWrapWorkspaceNames: (wrap) => {
					set({ wrapWorkspaceNames: wrap });
				},
			}),
			{
				name: "sidebar-preferences",
			},
		),
		{ name: "SidebarPreferencesStore" },
	),
);

export const useWrapWorkspaceNames = () =>
	useSidebarPreferencesStore((state) => state.wrapWorkspaceNames);
export const useSetWrapWorkspaceNames = () =>
	useSidebarPreferencesStore((state) => state.setWrapWorkspaceNames);
