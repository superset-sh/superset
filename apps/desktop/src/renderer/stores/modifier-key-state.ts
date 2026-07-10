import { create } from "zustand";

interface ModifierKeyState {
	heldKeys: Set<string>;
	isModifierHeld: boolean;
	pressKey: (key: string) => void;
	releaseKey: (key: string) => void;
	clearAll: () => void;
}

export const useModifierKeyStateStore = create<ModifierKeyState>((set) => ({
	heldKeys: new Set<string>(),
	isModifierHeld: false,
	pressKey: (key) =>
		set((state) => {
			if (state.heldKeys.has(key)) return state;
			const next = new Set(state.heldKeys);
			next.add(key);
			return { heldKeys: next };
		}),
	releaseKey: (key) =>
		set((state) => {
			if (!state.heldKeys.has(key)) return state;
			const next = new Set(state.heldKeys);
			next.delete(key);
			return { heldKeys: next };
		}),
	clearAll: () => set({ heldKeys: new Set<string>(), isModifierHeld: false }),
}));
