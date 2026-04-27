import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface ZenModeState {
	isZenMode: boolean;
	hasShownHint: boolean;
	toggleZenMode: () => void;
	setZenMode: (value: boolean) => void;
	markHintShown: () => void;
}

export const useZenModeStore = create<ZenModeState>()(
	devtools(
		persist(
			(set) => ({
				isZenMode: false,
				hasShownHint: false,
				toggleZenMode: () => set((s) => ({ isZenMode: !s.isZenMode })),
				setZenMode: (value) => set({ isZenMode: value }),
				markHintShown: () => set({ hasShownHint: true }),
			}),
			{
				name: "zen-mode-store",
				partialize: (state) => ({ hasShownHint: state.hasShownHint }),
			},
		),
		{ name: "ZenModeStore" },
	),
);
