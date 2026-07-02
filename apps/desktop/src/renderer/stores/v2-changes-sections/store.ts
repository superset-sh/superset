import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type V2ChangesSectionKey =
	| "unstaged"
	| "staged"
	| "against-base"
	| "commit";

interface V2ChangesSectionsState {
	collapsed: Partial<Record<V2ChangesSectionKey, boolean>>;
	toggle: (key: V2ChangesSectionKey) => void;
}

export const useV2ChangesSectionsStore = create<V2ChangesSectionsState>()(
	devtools(
		persist(
			(set) => ({
				collapsed: {},
				toggle: (key) =>
					set((state) => ({
						collapsed: { ...state.collapsed, [key]: !state.collapsed[key] },
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
