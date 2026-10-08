import type { UserContent } from "@superset/chat/protocol";
import { create } from "zustand";

export interface PendingChatLaunch {
	content: UserContent[];
	modelLabel: string | null;
	effortLabel: string | null;
}

interface PendingChatLaunchStore {
	bySessionId: Record<string, PendingChatLaunch>;
	queue: (sessionId: string, launch: PendingChatLaunch) => void;
	take: (sessionId: string) => PendingChatLaunch | null;
}

export const usePendingChatLaunchStore = create<PendingChatLaunchStore>()(
	(set, get) => ({
		bySessionId: {},
		queue: (sessionId, launch) =>
			set((state) => ({
				bySessionId: { ...state.bySessionId, [sessionId]: launch },
			})),
		take: (sessionId) => {
			const launch = get().bySessionId[sessionId] ?? null;
			if (launch) {
				set((state) => {
					const { [sessionId]: _taken, ...bySessionId } = state.bySessionId;
					return { bySessionId };
				});
			}
			return launch;
		},
	}),
);
