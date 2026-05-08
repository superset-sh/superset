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
			diffStyle: "split",
			showDiffComments: true,
			update: (key, value) => set({ [key]: value }),
		}),
		{ name: "settings" },
	),
);
