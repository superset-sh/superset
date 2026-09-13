import { create } from "zustand";

export interface ArchiveWorkspaceTarget {
	workspaceId: string;
	workspaceName: string;
	tick: number;
}

interface ArchiveWorkspaceIntentState {
	target: ArchiveWorkspaceTarget | null;
	request: (target: Omit<ArchiveWorkspaceTarget, "tick">) => void;
	clear: () => void;
}

export const useArchiveWorkspaceIntent = create<ArchiveWorkspaceIntentState>(
	(set, get) => ({
		target: null,
		request: (target) => {
			const prevTick = get().target?.tick ?? 0;
			set({ target: { ...target, tick: prevTick + 1 } });
		},
		clear: () => set({ target: null }),
	}),
);
