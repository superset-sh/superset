import type { ExternalApp } from "@superset/local-db";
import { create } from "zustand";

export interface SetPreferredOpenInAppTarget {
	projectId: string;
	app: ExternalApp;
	tick: number;
}

interface SetPreferredOpenInAppIntentState {
	target: SetPreferredOpenInAppTarget | null;
	request: (target: Omit<SetPreferredOpenInAppTarget, "tick">) => void;
	clear: () => void;
}

export const useSetPreferredOpenInAppIntent =
	create<SetPreferredOpenInAppIntentState>((set, get) => ({
		target: null,
		request: (target) => {
			const prevTick = get().target?.tick ?? 0;
			set({ target: { ...target, tick: prevTick + 1 } });
		},
		clear: () => set({ target: null }),
	}));
