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
			// localStorage lifecycle (see apps/desktop/AGENTS.md):
			// - Bound: fixed-size singleton — one boolean, rewritten in place, so
			//   the key can't grow with workspaces, projects, or sessions.
			// - Deletion: nothing entity-scoped to reap; toggling overwrites the
			//   same key, and a profile that never opens the setting never writes.
			// - On feature removal: move "sidebar-preferences" to DEAD_KEYS in the
			//   same change that deletes this writer, so the boot sweep clears it
			//   from existing profiles.
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
