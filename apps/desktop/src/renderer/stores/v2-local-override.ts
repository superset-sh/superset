import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface V2LocalOverrideState {
	/**
	 * The user's v2 opt-in state.
	 * - `null` means unresolved on this install — `V2DefaultResolver` will set it
	 *   once based on whether any v1 workspace exists.
	 * - `true` / `false` is a concrete choice (resolver default or user toggle).
	 */
	optInV2: boolean | null;
	setOptInV2: (optInV2: boolean) => void;
}

export const useV2LocalOverrideStore = create<V2LocalOverrideState>()(
	devtools(
		persist(
			(set) => ({
				optInV2: null,
				setOptInV2: (optInV2) => set({ optInV2 }),
			}),
			{ name: "v2-local-override-v2" },
		),
		{ name: "V2LocalOverrideStore" },
	),
);
