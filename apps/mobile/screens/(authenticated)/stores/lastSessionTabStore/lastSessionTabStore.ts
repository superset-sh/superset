import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Same bound as desktop's v2 pane selection: past any number of workspaces a
 * phone opens, but finite, so ids for workspaces deleted on some other machine
 * cannot pile up here forever. Nothing else tells this device that a workspace
 * is gone — the home list only ever names one host's.
 */
const MAX_REMEMBERED_WORKSPACES = 100;

/**
 * Device-local last active tab: workspaceId → the session that was attached
 * when the user last left the workspace, so reopening it lands where they
 * were rather than on the first tab. Only a hint — a session that has since
 * exited is no longer in the strip, and the screen falls back to the first
 * row.
 */
interface LastSessionTabStore {
	tabByWorkspace: Record<string, string>;
	/** False until AsyncStorage answers — the first tab would win the race. */
	hasHydrated: boolean;
	setLastSessionTab: (workspaceId: string, terminalId: string) => void;
}

export const useLastSessionTabStore = create<LastSessionTabStore>()(
	persist(
		(set) => ({
			tabByWorkspace: {},
			hasHydrated: false,
			setLastSessionTab: (workspaceId, terminalId) => {
				set((state) => {
					// Re-inserted rather than assigned in place, so key order stays
					// least-recently-opened first (JSON round-trips it) and the
					// eviction below drops a workspace this device stopped opening
					// rather than whichever one it happens to reach.
					const { [workspaceId]: _previous, ...rest } = state.tabByWorkspace;
					const tabByWorkspace = { ...rest, [workspaceId]: terminalId };
					const overflow = Object.keys(tabByWorkspace).slice(
						0,
						-MAX_REMEMBERED_WORKSPACES,
					);
					for (const stale of overflow) delete tabByWorkspace[stale];
					return { tabByWorkspace };
				});
			},
		}),
		{
			name: "last-session-tab-v1",
			storage: createJSONStorage(() => AsyncStorage),
			partialize: ({ tabByWorkspace }) => ({ tabByWorkspace }),
			// Flips on storage errors too, so a failed read falls back to the
			// first tab rather than leaving the screen on its spinner.
			onRehydrateStorage: () => () =>
				useLastSessionTabStore.setState({ hasHydrated: true }),
		},
	),
);
