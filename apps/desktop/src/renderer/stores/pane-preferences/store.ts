import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface PanePreferencesState {
	focusFollowsMouse: boolean;
	setFocusFollowsMouse: (value: boolean) => void;
}

export const usePanePreferencesStore = create<PanePreferencesState>()(
	devtools(
		persist(
			(set) => ({
				focusFollowsMouse: false,
				setFocusFollowsMouse: (value) => {
					set({ focusFollowsMouse: value });
				},
			}),
			{ name: "pane-preferences" },
		),
		{ name: "PanePreferencesStore" },
	),
);

export const useFocusFollowsMouse = () =>
	usePanePreferencesStore((state) => state.focusFollowsMouse);

export const useSetFocusFollowsMouse = () =>
	usePanePreferencesStore((state) => state.setFocusFollowsMouse);
