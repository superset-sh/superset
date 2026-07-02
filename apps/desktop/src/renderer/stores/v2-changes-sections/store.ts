import type { DiffFileSource } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type V2ChangesSectionKey = DiffFileSource["kind"];

interface V2ChangesSectionsState {
	collapsed: Partial<Record<V2ChangesSectionKey, boolean>>;
	setCollapsed: (key: V2ChangesSectionKey, collapsed: boolean) => void;
}

export const useV2ChangesSectionsStore = create<V2ChangesSectionsState>()(
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
		{ name: "V2ChangesSections" },
	),
);
