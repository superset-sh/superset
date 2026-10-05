import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Device-local manual unread marks, like desktop's v2-notifications
 * manualUnread: a marked workspace wears `review` attention on home until it
 * is opened or marked read again.
 */
const MAX_CLOUD_READS = 300;

interface UnreadWorkspacesStore {
	manualUnread: Record<string, true>;
	/** Desktop's cloud lastReadAt: the agent update a cloud workspace was last opened at. */
	cloudReadAt: Record<string, number>;
	markCloudRead: (workspaceId: string, agentStatusAt: number) => void;
	setManualUnread: (workspaceId: string) => void;
	clearManualUnread: (workspaceId: string) => void;
}

export const useUnreadWorkspacesStore = create<UnreadWorkspacesStore>()(
	persist(
		(set) => ({
			manualUnread: {},
			cloudReadAt: {},
			markCloudRead: (workspaceId, agentStatusAt) => {
				set((state) => {
					if ((state.cloudReadAt[workspaceId] ?? 0) >= agentStatusAt) {
						return state;
					}
					const entries = Object.entries({
						...state.cloudReadAt,
						[workspaceId]: agentStatusAt,
					})
						.sort((left, right) => right[1] - left[1])
						.slice(0, MAX_CLOUD_READS);
					return { cloudReadAt: Object.fromEntries(entries) };
				});
			},
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
