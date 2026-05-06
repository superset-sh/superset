import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface V2AvailableBannerState {
	dismissed: boolean;
	dismiss: () => void;
}

export const useV2AvailableBannerStore = create<V2AvailableBannerState>()(
	devtools(
		persist(
			(set) => ({
				dismissed: false,
				dismiss: () => set({ dismissed: true }),
			}),
			{ name: "v2-available-banner-v1" },
		),
		{ name: "V2AvailableBannerStore" },
	),
);
