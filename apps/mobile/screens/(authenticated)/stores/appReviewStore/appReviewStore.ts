import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * What the user has done on their phone (messages sent to a session,
 * workspaces created) plus when we last asked for an App Store rating.
 * `actedSinceHome` is memory-only: it is what makes the next return to Home
 * the moment to ask, and a cold launch never counts as a return.
 */
interface AppReviewStore {
	messagesSent: number;
	workspacesCreated: number;
	actedSinceHome: boolean;
	lastPromptedAt: number | null;
	lastPromptedVersion: string | null;
	recordMessageSent: () => void;
	recordWorkspaceCreated: () => void;
	clearActedSinceHome: () => void;
	markPrompted: (now: number, version: string) => void;
}

type PersistedAppReview = Pick<
	AppReviewStore,
	| "messagesSent"
	| "workspacesCreated"
	| "lastPromptedAt"
	| "lastPromptedVersion"
>;

export const useAppReviewStore = create<AppReviewStore>()(
	persist(
		(set) => ({
			messagesSent: 0,
			workspacesCreated: 0,
			actedSinceHome: false,
			lastPromptedAt: null,
			lastPromptedVersion: null,
			recordMessageSent: () =>
				set((state) => ({
					messagesSent: state.messagesSent + 1,
					actedSinceHome: true,
				})),
			recordWorkspaceCreated: () =>
				set((state) => ({
					workspacesCreated: state.workspacesCreated + 1,
					actedSinceHome: true,
				})),
			clearActedSinceHome: () => set({ actedSinceHome: false }),
			markPrompted: (now, version) =>
				set({ lastPromptedAt: now, lastPromptedVersion: version }),
		}),
		{
			name: "app-review-v1",
			version: 1,
			storage: createJSONStorage(() => AsyncStorage),
			partialize: ({
				messagesSent,
				workspacesCreated,
				lastPromptedAt,
				lastPromptedVersion,
			}): PersistedAppReview => ({
				messagesSent,
				workspacesCreated,
				lastPromptedAt,
				lastPromptedVersion,
			}),
			migrate: (persisted) => {
				const { lastPromptedAt = null, lastPromptedVersion = null } =
					(persisted ?? {}) as Partial<PersistedAppReview>;
				return {
					messagesSent: 0,
					workspacesCreated: 0,
					lastPromptedAt,
					lastPromptedVersion,
				};
			},
		},
	),
);
