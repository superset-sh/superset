import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface V2LocalOverrideState {
	/** When true, forces v1 mode locally even though v2 is enabled remotely. */
	forceV1: boolean;
	toggle: () => void;
}

export const useV2LocalOverrideStore = create<V2LocalOverrideState>()(
	devtools(
		persist(
			(set, get) => ({
				forceV1: false,
				toggle: () => set({ forceV1: !get().forceV1 }),
			}),
			{ name: "v2-local-override" },
		),
		{ name: "V2LocalOverrideStore" },
	),
);
