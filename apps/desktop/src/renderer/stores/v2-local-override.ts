import { hasPriorSupersetUsage } from "renderer/lib/hasPriorSupersetUsage";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface V2LocalOverrideState {
	/** When true, the user has opted into v2. v2 is gated behind both the remote flag and this opt-in. */
	optInV2: boolean;
	setOptInV2: (optInV2: boolean) => void;
}

// Fresh installs default to v2; returning v1 users default to v1 and discover
// v2 via the in-sidebar banner. Persist hydration overrides this for anyone
// with a saved override.
const initialOptInV2 = !hasPriorSupersetUsage();

export const useV2LocalOverrideStore = create<V2LocalOverrideState>()(
	devtools(
		persist(
			(set) => ({
				optInV2: initialOptInV2,
				setOptInV2: (optInV2) => set({ optInV2 }),
			}),
			{ name: "v2-local-override-v2" },
		),
		{ name: "V2LocalOverrideStore" },
	),
);
