import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface V2LocalOverrideState {
	/**
	 * The user's explicit v2 opt-in choice.
	 * - `null` means no explicit choice — the effective default is derived from account age (see `useIsV2CloudEnabled`).
	 * - `true` / `false` means the user toggled the setting and that choice should win.
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
