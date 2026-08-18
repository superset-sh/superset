import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface AppVersionHistoryState {
	/** Version seen on the previous run; null until the first update. */
	previousVersion: string | null;
	lastRunVersion: string | null;
	/** Call once per boot; records an update transition when the version changed. */
	recordBoot: (currentVersion: string) => void;
}

export const useAppVersionHistoryStore = create<AppVersionHistoryState>()(
	devtools(
		persist(
			(set, get) => ({
				previousVersion: null,
				lastRunVersion: null,
				recordBoot: (currentVersion) => {
					const { lastRunVersion } = get();
					if (lastRunVersion === currentVersion) return;
					set({
						// first run ever stays a fresh install (no previous version)
						previousVersion: lastRunVersion,
						lastRunVersion: currentVersion,
					});
				},
			}),
			{ name: "app-version-history-v1" },
		),
		{ name: "AppVersionHistory" },
	),
);
