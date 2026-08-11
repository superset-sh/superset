import { create } from "zustand";

export interface DeleteWorkspaceTarget {
	workspaceId: string;
	workspaceName: string;
}

/**
 * Drives the single globally-mounted v2 delete dialog (DeleteWorkspaceMount).
 * The destroy pipeline archives the row FIRST, so any dialog mounted under a
 * workspace row unmounts the moment the destroy starts — every delete entry
 * point requests through this store instead. `open` is tracked separately
 * from `target` so the dialog stays mounted (latched) through an in-flight
 * destroy and can re-open itself on a teardown failure. `setOpen`/`close`
 * take the workspaceId so a stale callback from a superseded delete (a new
 * `request` replaced the target mid-flight) can't close or reopen the new
 * target's dialog.
 */
interface DeleteWorkspaceIntentState {
	target: DeleteWorkspaceTarget | null;
	open: boolean;
	request: (target: DeleteWorkspaceTarget) => void;
	setOpen: (workspaceId: string, open: boolean) => void;
	close: (workspaceId: string) => void;
}

export const useDeleteWorkspaceIntent = create<DeleteWorkspaceIntentState>(
	(set) => ({
		target: null,
		open: false,
		request: (target) => set({ target, open: true }),
		setOpen: (workspaceId, open) =>
			set((state) =>
				state.target?.workspaceId === workspaceId ? { open } : state,
			),
		close: (workspaceId) =>
			set((state) =>
				state.target?.workspaceId === workspaceId
					? { target: null, open: false }
					: state,
			),
	}),
);
