import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ChangesOpenTarget = "pane" | "tab";

interface Settings {
	diffStyle: "split" | "unified";
	showDiffComments: boolean;
	expandUnchanged: boolean;
	/** How the top-bar Changes button (and ⌘⇧L) opens the Changes surface:
	 * split the current tab, or focus/create a dedicated tab. */
	changesOpenTarget: ChangesOpenTarget;
}

interface SettingsStore extends Settings {
	update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

export const useSettings = create<SettingsStore>()(
	persist(
		(set) => ({
			diffStyle: "split",
			showDiffComments: true,
			expandUnchanged: false,
			changesOpenTarget: "pane",
			update: (key, value) => set({ [key]: value }),
		}),
		{ name: "settings" },
	),
);
