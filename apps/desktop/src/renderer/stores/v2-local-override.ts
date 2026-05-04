import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

const IS_DEV = process.env.NODE_ENV === "development";

interface V2LocalOverrideState {
	/** When true, the user has opted into v2. v2 is gated behind both the remote flag and this opt-in. */
	optInV2: boolean;
	setOptInV2: (optInV2: boolean) => void;
}

export const useV2LocalOverrideStore = create<V2LocalOverrideState>()(
	devtools(
		persist(
			(set) => ({
				optInV2: IS_DEV,
				setOptInV2: (optInV2) => set({ optInV2 }),
			}),
			{ name: "v2-local-override-v2" },
		),
		{ name: "V2LocalOverrideStore" },
	),
);
