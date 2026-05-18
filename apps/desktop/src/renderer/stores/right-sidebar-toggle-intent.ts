import { create } from "zustand";

interface RightSidebarToggleIntentState {
	tick: number;
	request: () => void;
}

export const useRightSidebarToggleIntent =
	create<RightSidebarToggleIntentState>((set) => ({
		tick: 0,
		request: () => set((state) => ({ tick: state.tick + 1 })),
	}));
