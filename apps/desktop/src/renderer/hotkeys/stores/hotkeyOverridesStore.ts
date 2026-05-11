import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type StoredBinding = string | null;

interface HotkeyOverridesState {
	/** Per-hotkey-id override. `null` = explicit unassignment. */
	overrides: Record<string, StoredBinding>;
	setOverride: (id: string, binding: StoredBinding) => void;
	resetOverride: (id: string) => void;
	resetAll: () => void;
}

/**
 * Older builds wrote `{ version: 2, mode, chord }` objects. Coerce those to
 * the bare chord string on hydrate so the rest of the system only deals with
 * one shape.
 */
function coerceLegacyBinding(value: unknown): StoredBinding {
	if (value === null) return null;
	if (typeof value === "string") return value;
	if (
		typeof value === "object" &&
		value !== null &&
		"chord" in value &&
		typeof (value as { chord: unknown }).chord === "string"
	) {
		return (value as { chord: string }).chord;
	}
	return null;
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
			version: 2,
			migrate: (persisted) => {
				if (!persisted || typeof persisted !== "object") {
					return { overrides: {} };
				}
				const raw = (persisted as { overrides?: Record<string, unknown> })
					.overrides;
				if (!raw) return { overrides: {} };
				const overrides: Record<string, StoredBinding> = {};
				for (const [id, value] of Object.entries(raw)) {
					overrides[id] = coerceLegacyBinding(value);
				}
				return { overrides };
			},
		},
	),
);
