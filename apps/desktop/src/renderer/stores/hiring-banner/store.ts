import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface HiringBannerState {
	dismissed: boolean;
	dismiss: () => void;
}

export const useHiringBannerStore = create<HiringBannerState>()(
	devtools(
		persist(
			(set) => ({
				dismissed: false,
				dismiss: () => set({ dismissed: true }),
			}),
			{ name: "hiring-banner-v1" },
		),
		{ name: "HiringBannerStore" },
	),
);
