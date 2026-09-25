import { create } from "zustand";

export interface QuickCreateWorkspaceTarget {
	projectId: string | null;
	tick: number;
}

interface QuickCreateWorkspaceIntentState {
	target: QuickCreateWorkspaceTarget | null;
	request: (projectId: string | null) => void;
	clear: () => void;
}

/**
 * Drives the globally-mounted QuickCreateWorkspaceMount: the command
 * palette's `Command.run` has no hook access, so it requests through this
 * store instead of calling `useQuickCreateWorkspace` directly.
 */
export const useQuickCreateWorkspaceIntent =
	create<QuickCreateWorkspaceIntentState>((set, get) => ({
		target: null,
		request: (projectId) => {
			const prevTick = get().target?.tick ?? 0;
			set({ target: { projectId, tick: prevTick + 1 } });
		},
		clear: () => set({ target: null }),
	}));
