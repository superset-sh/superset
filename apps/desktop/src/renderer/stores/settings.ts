import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Settings {
	diffStyle: "split" | "unified";
	showDiffComments: boolean;
}

interface SettingsStore extends Settings {
	update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

export const useSettings = create<SettingsStore>()(
	persist(
		(set) => ({
			diffStyle: "unified",
			showDiffComments: true,
			update: (key, value) => set({ [key]: value }),
		}),
		{
			name: "settings",
			version: 1,
			migrate: (persisted, version) => {
				const state = (persisted ?? {}) as Record<string, unknown>;
				if (version < 1) {
					state.diffStyle = "unified";
				}
				return state as unknown as SettingsStore;
			},
		},
	),
);
