import { create } from "zustand";

interface RowlessAgentTreeStore {
	/** "Show tree in sidebar" by workspace id, for workspaces without a local row. */
	shown: Record<string, boolean>;
	setShown: (workspaceId: string, shown: boolean) => void;
}

/**
 * Session-only switch state for workspaces with no v2WorkspaceLocalState
 * row (auto-included local `main` checkouts). Those rows are only created
 * by an explicit sidebar placement, and flipping the switch must not fake
 * one, so the choice lives here and is forgotten on restart, like the
 * sidebar tab those workspaces don't persist either.
 */
export const useRowlessAgentTreeStore = create<RowlessAgentTreeStore>()(
	(set) => ({
		shown: {},
		setShown: (workspaceId, shown) =>
			set((state) => ({ shown: { ...state.shown, [workspaceId]: shown } })),
	}),
);
