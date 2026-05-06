import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useKeyboardLayoutStore } from "./keyboardLayoutStore";

interface KeyboardPreferencesState {
	/** When true (default), logical bindings are translated through the OS
	 *  keyboard layout — e.g. `⌘Z` fires on the key labeled "Z" regardless
	 *  of layout (physical KeyY on QWERTZ). Matches macOS / VS Code / Chrome
	 *  convention. Flip off to anchor bindings to physical key positions
	 *  (`⌘Z` always on physical KeyZ, regardless of label). */
	adaptiveLayoutEnabled: boolean;
	setAdaptiveLayoutEnabled: (enabled: boolean) => void;
}

export const useKeyboardPreferencesStore = create<KeyboardPreferencesState>()(
	persist(
		(set) => ({
			adaptiveLayoutEnabled: true,
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

/**
 * The layout map every dispatch consumer should use. Returns the OS layout
 * map only when adaptive mapping is on; null otherwise (so logical bindings
 * fall back to their authored chord). This is the single chokepoint —
 * `useHotkey`, the resolver index, the display hooks, the recorder's
 * conflict detector, and the imperative `getDispatchChord` all read through
 * this so a future option that should affect dispatch doesn't have to be
 * threaded through five callsites and miss one. Don't read
 * `useKeyboardLayoutStore` directly outside this file.
 */
export function useEffectiveLayoutMap(): ReadonlyMap<string, string> | null {
	const layoutMap = useKeyboardLayoutStore((s) => s.map);
	const adaptive = useKeyboardPreferencesStore((s) => s.adaptiveLayoutEnabled);
	return adaptive ? layoutMap : null;
}

/** Imperative form of {@link useEffectiveLayoutMap} for non-React contexts. */
export function getEffectiveLayoutMap(): ReadonlyMap<string, string> | null {
	const adaptive = useKeyboardPreferencesStore.getState().adaptiveLayoutEnabled;
	return adaptive ? useKeyboardLayoutStore.getState().map : null;
}
