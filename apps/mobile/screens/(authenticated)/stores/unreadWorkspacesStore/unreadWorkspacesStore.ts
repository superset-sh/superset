import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Device-local manual unread marks, like desktop's v2-notifications
 * manualUnread: a marked workspace wears `review` attention on home until it
 * is opened or marked read again.
 */
interface UnreadWorkspacesStore {
	manualUnread: Record<string, true>;
	setManualUnread: (workspaceId: string) => void;
	clearManualUnread: (workspaceId: string) => void;
}

export const useUnreadWorkspacesStore = create<UnreadWorkspacesStore>()(
	persist(
		(set) => ({
			manualUnread: {},
			setManualUnread: (workspaceId) => {
				set((state) => ({
					manualUnread: { ...state.manualUnread, [workspaceId]: true },
				}));
			},
			clearManualUnread: (workspaceId) => {
				set((state) => {
					if (!(workspaceId in state.manualUnread)) return state;
					const { [workspaceId]: _removed, ...manualUnread } =
						state.manualUnread;
					return { manualUnread };
				});
			},
		}),
		{
			name: "unread-workspaces-v1",
			storage: createJSONStorage(() => AsyncStorage),
		},
	),
);
