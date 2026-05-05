import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface KeyboardPreferencesState {
	/** Opt-in: when true, logical bindings are translated through the OS
	 *  keyboard layout — e.g. `⌘Z` dispatches to physical KeyY on QWERTZ.
	 *  Defaults to false so bindings dispatch and display as if on US-ANSI
	 *  regardless of the current input source. */
	adaptiveLayoutEnabled: boolean;
	setAdaptiveLayoutEnabled: (enabled: boolean) => void;
}

export const useKeyboardPreferencesStore = create<KeyboardPreferencesState>()(
	persist(
		(set) => ({
			adaptiveLayoutEnabled: false,
			setAdaptiveLayoutEnabled: (enabled) =>
				set({ adaptiveLayoutEnabled: enabled }),
		}),
		{
			name: "keyboard-preferences",
			storage: createJSONStorage(() => localStorage),
			partialize: (state) => ({
				adaptiveLayoutEnabled: state.adaptiveLayoutEnabled,
			}),
		},
	),
);
