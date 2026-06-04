import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ShortcutBinding } from "../types";

interface HotkeyOverridesState {
	/** Per-hotkey-id override. `null` = explicit unassignment. Stored as the
	 *  ShortcutBinding shape: bare string for physical-mode bindings (legacy
	 *  + shipped defaults), v2 object for logical / named modes. */
	overrides: Record<string, ShortcutBinding | null>;
	setOverride: (id: string, binding: ShortcutBinding | null) => void;
	resetOverride: (id: string) => void;
	resetAll: () => void;
}

export const useHotkeyOverridesStore = create<HotkeyOverridesState>()(
	persist(
		(set) => ({
			overrides: {},
			setOverride: (id, keys) =>
				set((state) => ({
					overrides: { ...state.overrides, [id]: keys },
				})),
			resetOverride: (id) =>
				set((state) => {
					const next = { ...state.overrides };
					delete next[id];
					return { overrides: next };
				}),
			resetAll: () => set({ overrides: {} }),
		}),
		{
			name: "hotkey-overrides",
			storage: createJSONStorage(() => localStorage),
			partialize: (state) => ({ overrides: state.overrides }),
		},
	),
);
