import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const MOMENT_DEDUPE_MS = 60 * 60 * 1000;

/**
 * Tally of moments Superset did something for the user (a merged pull
 * request, a session an agent finished for them) plus when we last asked
 * for an App Store rating. Moments closer than an hour apart count once, so
 * an agent stopping several times while the user watches is one moment.
 */
interface AppReviewStore {
	positiveMoments: number;
	lastMomentAt: number | null;
	lastPromptedAt: number | null;
	lastPromptedVersion: string | null;
	recordPositiveMoment: (now: number) => number;
	markPrompted: (now: number, version: string) => void;
}

export const useAppReviewStore = create<AppReviewStore>()(
	persist(
		(set, get) => ({
			positiveMoments: 0,
			lastMomentAt: null,
			lastPromptedAt: null,
			lastPromptedVersion: null,
			recordPositiveMoment: (now) => {
				const { positiveMoments, lastMomentAt } = get();
				if (lastMomentAt !== null && now - lastMomentAt < MOMENT_DEDUPE_MS) {
					return positiveMoments;
				}
				const next = positiveMoments + 1;
				set({ positiveMoments: next, lastMomentAt: now });
				return next;
			},
			markPrompted: (now, version) =>
				set({ lastPromptedAt: now, lastPromptedVersion: version }),
		}),
		{
			name: "app-review-v1",
			storage: createJSONStorage(() => AsyncStorage),
		},
	),
);
