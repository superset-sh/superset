import { create } from "zustand";

export interface RemoveFromSidebarTarget {
	workspaceId: string;
	workspaceName: string;
	projectId: string;
	isMain: boolean;
	tick: number;
}

interface RemoveFromSidebarIntentState {
	target: RemoveFromSidebarTarget | null;
	request: (target: Omit<RemoveFromSidebarTarget, "tick">) => void;
	clear: () => void;
}

export const useRemoveFromSidebarIntent = create<RemoveFromSidebarIntentState>(
	(set, get) => ({
		target: null,
		request: (target) => {
			const prevTick = get().target?.tick ?? 0;
			set({ target: { ...target, tick: prevTick + 1 } });
		},
		clear: () => set({ target: null }),
	}),
);
