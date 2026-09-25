import type { DiffFileSource } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/hooks/useChangeset";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type ChangesSectionKey = DiffFileSource["kind"];

interface ChangesSectionsState {
	collapsed: Partial<Record<ChangesSectionKey, boolean>>;
	setCollapsed: (key: ChangesSectionKey, collapsed: boolean) => void;
}

export const useChangesSectionsStore = create<ChangesSectionsState>()(
	devtools(
		persist(
			(set) => ({
				collapsed: {},
				setCollapsed: (key, collapsed) =>
					set((state) => ({
						collapsed: { ...state.collapsed, [key]: collapsed },
					})),
			}),
			{
				name: "v2-changes-sections-v1",
				partialize: (state) => ({ collapsed: state.collapsed }),
			},
		),
		{ name: "ChangesSections" },
	),
);
