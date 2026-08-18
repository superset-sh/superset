import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * Renderer-local watermark of the newest automation failure the user has seen,
 * so opening the Automations page clears the sidebar failure badge until a
 * newer run fails. The failure count itself is DERIVED from run data (see
 * `useFailedAutomations`); the only fact stored here is the user's seen mark.
 */
export interface AutomationFailuresState {
	/**
	 * createdAt (ms) of the newest failed run the user has acknowledged. This is
	 * the run's DB timestamp (a single server clock), so it's comparable across
	 * hosts without skew — never substitute the renderer clock here.
	 */
	lastSeenFailureAt: number;
	/** Acknowledge failures up to `at`. Monotonic — never moves backward. */
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
