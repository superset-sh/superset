import { create } from "zustand";
import { persist } from "zustand/middleware";

interface GettingStartedState {
	tried: number;
	dismissed: boolean;
	hasCompleted: boolean;
	complete: () => void;
	markTried: (step: number) => void;
	dismiss: () => void;
	show: () => void;
}

export const useGettingStartedStore = create<GettingStartedState>()(
	persist(
		(set) => ({
			tried: 0,
			dismissed: false,
			hasCompleted: false,
			complete: () => set({ hasCompleted: true, dismissed: true }),
			markTried: (step) => {
				if (Number.isInteger(step) && step >= 0 && step < 3)
					set((state) => ({ tried: (state.tried | (1 << step)) & 7 }));
			},
			dismiss: () => set({ dismissed: true }),
			show: () => set({ dismissed: false }),
		}),
		{
			name: "pro-getting-started-v1",
			version: 1,
			migrate: (state) => ({
				dismissed: Boolean((state as { dismissed?: boolean })?.dismissed),
				tried: 0,
			}),
			partialize: ({ tried, dismissed, hasCompleted }) => ({
				tried,
				dismissed,
				hasCompleted,
			}),
		},
	),
);
