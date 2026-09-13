import { create } from "zustand";
import { persist } from "zustand/middleware";

interface GettingStartedState {
	tried: number;
	dismissed: boolean;
	markTried: (step: number) => void;
	dismiss: () => void;
	show: () => void;
}

export const useGettingStartedStore = create<GettingStartedState>()(
	persist(
		(set) => ({
			tried: 0,
			dismissed: false,
			markTried: (step) => {
				if (Number.isInteger(step) && step >= 0 && step < 4)
					set((state) => ({ tried: (state.tried | (1 << step)) & 15 }));
			},
			dismiss: () => set({ dismissed: true }),
			show: () => set({ dismissed: false }),
		}),
		{
			name: "getting-started-v1",
			partialize: ({ tried, dismissed }) => ({ tried, dismissed }),
		},
	),
);
