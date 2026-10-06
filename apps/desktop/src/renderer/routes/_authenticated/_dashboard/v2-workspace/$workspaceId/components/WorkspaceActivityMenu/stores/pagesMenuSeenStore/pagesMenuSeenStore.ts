import { create } from "zustand";

const SESSION_STARTED_AT = Date.now();

interface PagesMenuSeenState {
	seenAtByWorkspace: Record<string, number>;
	markSeen: (workspaceId: string, publishedAtMs: number) => void;
}

export const usePagesMenuSeenStore = create<PagesMenuSeenState>((set) => ({
	seenAtByWorkspace: {},
	markSeen: (workspaceId, publishedAtMs) =>
		set((state) => {
			const current =
				state.seenAtByWorkspace[workspaceId] ?? SESSION_STARTED_AT;
			if (publishedAtMs <= current) return state;
			return {
				seenAtByWorkspace: {
					...state.seenAtByWorkspace,
					[workspaceId]: publishedAtMs,
				},
			};
		}),
}));

export function usePagesMenuSeenAt(workspaceId: string): number {
	return usePagesMenuSeenStore(
		(state) => state.seenAtByWorkspace[workspaceId] ?? SESSION_STARTED_AT,
	);
}
