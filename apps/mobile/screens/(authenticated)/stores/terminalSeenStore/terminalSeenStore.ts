import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Port of desktop's v2-notifications seen map: terminalId → last agent
 * event the user has seen, compared against the host binding's lastEventAt
 * to derive `review` (unseen Stop). Values are HOST-clock timestamps (the
 * binding's lastEventAt) — never the device clock, which can drift and
 * poison the monotonic comparison.
 */
interface TerminalSeenStore {
	terminalSeenAt: Record<string, number>;
	markTerminalSeen: (terminalId: string, at: number) => void;
}

export const useTerminalSeenStore = create<TerminalSeenStore>()(
	persist(
		(set) => ({
			terminalSeenAt: {},
			markTerminalSeen: (terminalId, at) => {
				set((state) => {
					const previous = state.terminalSeenAt[terminalId];
					// Monotonic: a late event must not roll the seen mark back.
					if (previous !== undefined && previous >= at) return state;
					return {
						terminalSeenAt: { ...state.terminalSeenAt, [terminalId]: at },
					};
				});
			},
		}),
		{
			name: "terminal-seen-v1",
			storage: createJSONStorage(() => AsyncStorage),
		},
	),
);
