import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export interface AutomationFailuresState {
	/** The newest acknowledged failed run's server `createdAt`, in ms. */
	lastSeenFailureAt: number;
	markFailuresSeen: (at: number) => void;
}

export const useAutomationFailuresStore = create<AutomationFailuresState>()(
	devtools(
		persist(
			(set) => ({
				lastSeenFailureAt: 0,
				markFailuresSeen: (at) => {
					set((state) =>
						at > state.lastSeenFailureAt ? { lastSeenFailureAt: at } : state,
					);
				},
			}),
			{
				name: "automation-failures-v1",
				version: 1,
				partialize: (state) => ({ lastSeenFailureAt: state.lastSeenFailureAt }),
			},
		),
		{ name: "AutomationFailures" },
	),
);
