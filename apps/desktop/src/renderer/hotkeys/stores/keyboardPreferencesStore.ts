import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface KeyboardPreferencesState {
	/** When true, shortcuts match `event.key.toLowerCase()` — `meta+t` fires on
	 *  whichever key produces 't' on the user's layout (physical KeyK on
	 *  Dvorak). When false (default), shortcuts match `event.code` — `meta+t`
	 *  fires on physical KeyT regardless of layout. Mirrors VS Code's
	 *  `keyboard.dispatch: 'code' | 'keyCode'`. */
	matchByTypedKey: boolean;
	setMatchByTypedKey: (enabled: boolean) => void;
}

export const useKeyboardPreferencesStore = create<KeyboardPreferencesState>()(
	persist(
		(set) => ({
			matchByTypedKey: false,
			setMatchByTypedKey: (enabled) => set({ matchByTypedKey: enabled }),
		}),
		{
			name: "keyboard-preferences",
			storage: createJSONStorage(() => localStorage),
			partialize: (state) => ({ matchByTypedKey: state.matchByTypedKey }),
			version: 2,
			// v1 used `adaptiveLayoutEnabled`; map that forward so users keep
			// their previous choice. (v1 default was `true`, matching the
			// `adaptive ON` ≈ `matchByTypedKey: true` semantics.)
			migrate: (persisted, version) => {
				if (version < 2 && persisted && typeof persisted === "object") {
					const old = persisted as { adaptiveLayoutEnabled?: boolean };
					if (typeof old.adaptiveLayoutEnabled === "boolean") {
						return { matchByTypedKey: old.adaptiveLayoutEnabled };
					}
				}
				return persisted as KeyboardPreferencesState;
			},
		},
	),
);

/** Imperative form for non-React contexts. */
export function getMatchByTypedKey(): boolean {
	return useKeyboardPreferencesStore.getState().matchByTypedKey;
}
