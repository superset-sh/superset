import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface HotkeyOverridesState {
	overrides: Record<string, string | null>;
	setOverride: (id: string, keys: string | null) => void;
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
