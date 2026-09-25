import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Device-local workspace pins, like desktop's sidebar pinnedAt state: pinned
 * workspaces float to the top of home, ordered by when they were pinned.
 */
interface PinnedWorkspacesStore {
	pinnedAt: Record<string, number>;
	togglePin: (workspaceId: string) => void;
}

export const usePinnedWorkspacesStore = create<PinnedWorkspacesStore>()(
	persist(
		(set) => ({
			pinnedAt: {},
			togglePin: (workspaceId) => {
				set((state) => {
					if (workspaceId in state.pinnedAt) {
						const { [workspaceId]: _removed, ...pinnedAt } = state.pinnedAt;
						return { pinnedAt };
					}
					return {
						pinnedAt: { ...state.pinnedAt, [workspaceId]: Date.now() },
					};
				});
			},
		}),
		{
			name: "pinned-workspaces-v1",
			storage: createJSONStorage(() => AsyncStorage),
		},
	),
);
