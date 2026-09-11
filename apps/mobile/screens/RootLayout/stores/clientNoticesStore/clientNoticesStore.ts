import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface ClientNoticesStore {
	/** Version this install ran before its most recent update; null until the first update. */
	previousVersion: string | null;
	lastRunVersion: string | null;
	/** Notice id → epoch ms when it was dismissed. */
	dismissedAt: Record<string, number>;
	/** False until AsyncStorage has answered; a dismissed notice must not flash first. */
	hasHydrated: boolean;
	recordBoot: (currentVersion: string) => void;
	dismiss: (noticeId: string) => void;
}

export const useClientNoticesStore = create<ClientNoticesStore>()(
	persist(
		(set, get) => ({
			previousVersion: null,
			lastRunVersion: null,
			dismissedAt: {},
			hasHydrated: false,
			recordBoot: (currentVersion) => {
				const { lastRunVersion } = get();
				if (lastRunVersion === currentVersion) return;
				set({
					previousVersion: lastRunVersion,
					lastRunVersion: currentVersion,
				});
			},
			dismiss: (noticeId) =>
				set((state) => ({
					dismissedAt: { ...state.dismissedAt, [noticeId]: Date.now() },
				})),
		}),
		{
			name: "client-notices-v1",
			storage: createJSONStorage(() => AsyncStorage),
			partialize: ({ previousVersion, lastRunVersion, dismissedAt }) => ({
				previousVersion,
				lastRunVersion,
				dismissedAt,
			}),
			onRehydrateStorage: () => () =>
				useClientNoticesStore.setState({ hasHydrated: true }),
		},
	),
);
